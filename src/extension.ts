import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import ignore from 'ignore'
import { minimatch } from 'minimatch'

export function activate(context: vscode.ExtensionContext) {
  let exportCommand = vscode.commands.registerCommand(
    'export-dir2file.exportToFile',
    exportToMarkdown
  )
  let createIgnoreCommand = vscode.commands.registerCommand(
    'export-dir2file.createIgnore',
    createExpIgnore
  )
  let createWhitelistCommand = vscode.commands.registerCommand(
    'export-dir2file.createWhitelist',
    createExpWhitelist
  )
  let exportTabsCommand = vscode.commands.registerCommand(
    'export-dir2file.exportActiveTabs',
    exportActiveTabs
  )

  context.subscriptions.push(
    exportCommand,
    createIgnoreCommand,
    createWhitelistCommand
  )
}

async function exportToMarkdown() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
  }

  const rootPath = workspaceFolder.uri.fsPath
  const config = await getConfig(rootPath)
  const outputPath = path.join(rootPath, config.output || 'export.md')
  let output: string[] = []

  const ignoreRules = await getIgnoreRules(rootPath, config.ignoreFile)
  const whitelistRules = await getWhitelistRules(rootPath, config.allowList)

  // Include project description
  if (config.description) {
    const descriptionPath = path.join(rootPath, config.description)
    if (fs.existsSync(descriptionPath)) {
      const descriptionContent = fs.readFileSync(descriptionPath, 'utf8')
      output.push(descriptionContent + '\n\n')
    } else {
      output.push(config.description + '\n\n')
    }
  }

  const includeStructure =
    config.includeProjectStructure ??
    (await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: 'Include project structure at the top of the file?',
    })) === 'Yes'

  if (includeStructure) {
    output.push('# Project Structure\n\n```\n')
    output.push(await generateProjectStructure(rootPath, ignoreRules))
    output.push('```\n\n')
  }

  output.push('# File Contents\n\n')

  processDirectory(rootPath, rootPath, ignoreRules, whitelistRules, output)

  fs.writeFileSync(outputPath, output.join(''))
  vscode.window.showInformationMessage(`Files exported to ${outputPath}`)
}

function processDirectory(
  dirPath: string,
  rootPath: string,
  ignoreRules: ReturnType<typeof ignore>,
  whitelistRules: string[],
  output: string[]
): void {
  const files = fs.readdirSync(dirPath)
  for (const file of files) {
    const filePath = path.join(dirPath, file)
    const relativePath = path.relative(rootPath, filePath)

    const isWhitelisted =
      whitelistRules.length === 0 ||
      whitelistRules.some((rule) => minimatch(relativePath, rule))
    const isIgnored = ignoreRules.ignores(relativePath)

    if (isWhitelisted && !isIgnored) {
      const stat = fs.statSync(filePath)
      if (stat.isDirectory()) {
        processDirectory(
          filePath,
          rootPath,
          ignoreRules,
          whitelistRules,
          output
        )
      } else {
        const content = fs.readFileSync(filePath, 'utf8')
        output.push(
          `## ${relativePath}\n\n\`\`\`\n${content.trimRight()}\n\`\`\`\n\n`
        )
      }
    }
  }
}

async function getConfig(rootPath: string): Promise<{
  ignoreFile: string
  allowList: string
  includeProjectStructure?: boolean
  output: string
  description?: string
}> {
  const configPath = path.join(rootPath, 'exportconfig.json')
  let config = {
    ignoreFile: '.export-ignore',
    allowList: '.export-whitelist',
    output: 'export.md',
  }
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf8')
    config = { ...config, ...JSON.parse(configContent) }
  }
  return config
}

async function getIgnoreRules(rootPath: string, ignoreFile: string) {
  const ignorePath = path.join(rootPath, ignoreFile)
  if (fs.existsSync(ignorePath)) {
    const ignoreContent = fs.readFileSync(ignorePath, 'utf8')
    return ignore().add(
      ignoreContent.split('\n').filter((line) => line.trim() !== '')
    )
  }
  return ignore()
}

async function getWhitelistRules(
  rootPath: string,
  allowList: string
): Promise<string[]> {
  const whitelistPath = path.join(rootPath, allowList)
  if (fs.existsSync(whitelistPath)) {
    const whitelistContent = fs.readFileSync(whitelistPath, 'utf8')
    return whitelistContent
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((pattern) => {
        // Handle directory patterns with trailing slashes
        if (pattern.endsWith('/')) {
          return pattern + '**'
        }
        return pattern
      })
  }
  return []
}

function generateProjectStructure(
  rootPath: string,
  ignoreRules: ReturnType<typeof ignore>
): string {
  let result = ''

  function addToStructure(currentPath: string, indent: string = ''): void {
    const files = fs.readdirSync(currentPath)
    files.sort((a, b) => {
      const aPath = path.join(currentPath, a)
      const bPath = path.join(currentPath, b)
      const aIsDir = fs.statSync(aPath).isDirectory()
      const bIsDir = fs.statSync(bPath).isDirectory()
      if (aIsDir && !bIsDir) {
        return -1
      }
      if (!aIsDir && bIsDir) {
        return 1
      }
      return a.localeCompare(b)
    })

    for (const file of files) {
      const filePath = path.join(currentPath, file)
      const relativePath = path.relative(rootPath, filePath)

      if (!ignoreRules.ignores(relativePath)) {
        const stat = fs.statSync(filePath)
        if (stat.isDirectory()) {
          result += `${indent}${file}/\n`
          addToStructure(filePath, indent + '  ')
        } else {
          result += `${indent}${file}\n`
        }
      }
    }
  }

  addToStructure(rootPath)
  return result
}

// TODO: separate ignore rules via comma
async function createExpIgnore() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
  }

  const rootPath = workspaceFolder.uri.fsPath
  const expIgnorePath = path.join(rootPath, '.expignore')

  if (fs.existsSync(expIgnorePath)) {
    const choice = await vscode.window.showQuickPick(
      ['Overwrite', 'Append', 'Cancel'],
      {
        placeHolder: '.exp-ignore already exists. What would you like to do?',
      }
    )

    if (choice === 'Cancel' || !choice) {
      return
    }

    if (choice === 'Append') {
      const content = await vscode.window.showInputBox({
        prompt: 'Enter patterns to ignore (separate via comma)',
      })
      if (content) {
        let ignoreList = content.split(',')
        ignoreList = ignoreList.map((item) => item.trim())
        for (const item of ignoreList) {
          fs.appendFileSync(expIgnorePath, `${item}\n`)
        }
        vscode.window.showInformationMessage('.exp-ignore updated')
      }
      return
    }
  }

  const gitignorePath = path.join(rootPath, '.gitignore')
  let initialContent = ''
  if (fs.existsSync(gitignorePath)) {
    initialContent = fs
      .readFileSync(gitignorePath, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .join(', ')
  }

  const content = await vscode.window.showInputBox({
    prompt: 'Enter patterns to ignore (separate via comma)',
    value: initialContent,
  })

  if (content) {
    let ignoreList = content.split(',')
    ignoreList = ignoreList.map((item) => item.trim())
    for (const item of ignoreList) {
      fs.appendFileSync(expIgnorePath, `${item}\n`)
    }
    vscode.window.showInformationMessage('.exp-ignore created')
  }
}

async function createExpWhitelist() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
  }

  const rootPath = workspaceFolder.uri.fsPath
  const expWhitelistPath = path.join(rootPath, '.export-whitelist')

  if (fs.existsSync(expWhitelistPath)) {
    const choice = await vscode.window.showQuickPick(
      ['Overwrite', 'Append', 'Cancel'],
      {
        placeHolder:
          '.export-whitelist already exists. What would you like to do?',
      }
    )

    if (choice === 'Cancel' || !choice) {
      return
    }

    if (choice === 'Append') {
      const content = await vscode.window.showInputBox({
        prompt: 'Enter patterns to whitelist (separate via comma)',
      })
      if (content) {
        let whitelistList = content.split(',')
        whitelistList = whitelistList.map((item) => item.trim())
        for (const item of whitelistList) {
          fs.appendFileSync(expWhitelistPath, '\n' + item)
        }
        vscode.window.showInformationMessage('.export-whitelist updated')
      }
      return
    }
  }

  const content = await vscode.window.showInputBox({
    prompt: 'Enter patterns to whitelist (one per line)',
  })

  if (content) {
    let whitelistList = content.split('\n')
    whitelistList = whitelistList.map((item) => item.trim())
    for (const item of whitelistList) {
      fs.appendFileSync(expWhitelistPath, '\n' + item)
    }
    vscode.window.showInformationMessage('.export-whitelist created')
  }
}

async function exportActiveTabs() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
  }

  const rootPath = workspaceFolder.uri.fsPath
  const config = await getConfig(rootPath)
  const outputPath = path.join(
    rootPath,
    config.output || 'active-tabs-export.md'
  )

  let output: string[] = []

  const activeTabs = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input instanceof vscode.TabInputText)
    .map((tab) => (tab.input as vscode.TabInputText).uri.fsPath)

  const ignoreRules = await getIgnoreRules(rootPath, config.ignoreFile)

  const includeStructure =
    config.includeProjectStructure ??
    (await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: 'Include project structure at the top of the file?',
    })) === 'Yes'

  if (includeStructure) {
    output.push('# Project Structure\n\n```\n')
    output.push(await generateProjectStructure(rootPath, ignoreRules))
    output.push('```\n\n')
  }

  output.push('# Active Tabs Content\n\n')

  for (const filePath of activeTabs) {
    const relativePath = path.relative(rootPath, filePath)
    const content = fs.readFileSync(filePath, 'utf8')
    output.push(
      `## ${relativePath}\n\n\`\`\`\n${content.trimRight()}\n\`\`\`\n\n`
    )
  }

  fs.writeFileSync(outputPath, output.join(''))
  vscode.window.showInformationMessage(`Active tabs exported to ${outputPath}`)
}

export function deactivate() {}
