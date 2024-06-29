import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import ignore from 'ignore'
import { minimatch } from 'minimatch'
import stripComments from 'strip-comments'

// WHAT A comments
// One Moreeeee
export function activate(context: vscode.ExtensionContext) {
  let exportCommand = vscode.commands.registerCommand(
    'directory2file.exportToFile',
    exportToMarkdown
  )
  let createIgnoreCommand = vscode.commands.registerCommand(
    'directory2file.createIgnore',
    createExpIgnore
  )
  let createWhitelistCommand = vscode.commands.registerCommand(
    'directory2file.createWhitelist',
    createExpWhitelist
  )
  let exportTabsCommand = vscode.commands.registerCommand(
    'directory2file.exportActiveTabs',
    exportActiveTabs
  )
  let openSettingsCommand = vscode.commands.registerCommand(
    'directory2file.openSettings',
    openExtensionSettings
  )

  console.log(
    'Global ignore rules:',
    vscode.workspace.getConfiguration('directory2file').get('globalIgnoreRules')
  )
  console.log(
    'Global whitelist rules:',
    vscode.workspace
      .getConfiguration('directory2file')
      .get('globalWhitelistRules')
  )

  context.subscriptions.push(
    exportCommand,
    createIgnoreCommand,
    createWhitelistCommand,
    exportTabsCommand,
    openSettingsCommand
  )
}

async function exportToMarkdown() {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) {
      throw new Error('No workspace folder open')
    }

    const rootPath = workspaceFolder.uri.fsPath
    const config = await getConfig(rootPath)
    const outputPath = await ensureOutputPath(
      rootPath,
      config.output || 'export.md'
    )
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

    processDirectory(
      rootPath,
      rootPath,
      ignoreRules,
      whitelistRules,
      output,
      config.removeComments === true
    )

    fs.writeFileSync(outputPath, output.join(''))
    vscode.window.showInformationMessage(`Files exported to ${outputPath}`)
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error exporting files: ${error.message}`)
  }
}

function processDirectory(
  dirPath: string,
  rootPath: string,
  ignoreRules: ReturnType<typeof ignore>,
  whitelistRules: string[],
  output: string[],
  removeComments: boolean
): void {
  try {
    const files = fs.readdirSync(dirPath)
    for (const file of files) {
      const filePath = path.join(dirPath, file)
      const relativePath = path.relative(rootPath, filePath)

      const isWhitelisted = whitelistRules.some(
        (rule) =>
          minimatch(relativePath, rule) || minimatch(relativePath + '/', rule) // Handle directory patterns
      )
      const isIgnored = !isWhitelisted && ignoreRules.ignores(relativePath)

      if (isWhitelisted || !isIgnored) {
        const stat = fs.statSync(filePath)
        if (stat.isDirectory()) {
          processDirectory(
            filePath,
            rootPath,
            ignoreRules,
            whitelistRules,
            output,
            removeComments
          )
        } else {
          let content = fs.readFileSync(filePath, 'utf8')
          if (removeComments) {
            content = stripComments(content)
          }
          output.push(
            `## ${relativePath}\n\n\`\`\`\n${content.trimRight()}\n\`\`\`\n\n`
          )
        }
      }
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Error processing directory: ${error.message}`
    )
  }
}

async function getConfig(rootPath: string): Promise<{
  ignoreFile: string
  allowList: string
  includeProjectStructure?: boolean
  output: string
  description?: string
  removeComments?: boolean
  allowIgnoredOnTabsExport?: boolean
}> {
  try {
    const configPath = path.join(rootPath, 'exportconfig.json')
    let config = {
      ignoreFile: '.export-ignore',
      allowList: '.export-whitelist',
      output: 'export.md',
      removeComments: false,
      allowIgnoredOnTabsExport: false,
    }
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8')
      config = { ...config, ...JSON.parse(configContent) }
    }
    return config
  } catch (error: any) {
    throw new Error(`Error reading config: ${error.message}`)
  }
}

async function getIgnoreRules(rootPath: string, ignoreFile: string) {
  try {
    const globalIgnoreRules = vscode.workspace
      .getConfiguration('exportDir2File')
      .get('globalIgnoreRules', [])
    const ignorePath = path.join(rootPath, ignoreFile)
    let ignoreRules = ignore().add(globalIgnoreRules)

    if (fs.existsSync(ignorePath)) {
      const ignoreContent = fs.readFileSync(ignorePath, 'utf8')
      ignoreRules = ignoreRules.add(
        ignoreContent.split('\n').filter((line) => line.trim() !== '')
      )
    }
    return ignoreRules
  } catch (error: any) {
    throw new Error(`Error getting ignore rules: ${error.message}`)
  }
}

async function getWhitelistRules(
  rootPath: string,
  allowList: string
): Promise<string[]> {
  try {
    const globalWhitelistRules: string[] = vscode.workspace
      .getConfiguration('exportDir2File')
      .get('globalWhitelistRules', [])
    const whitelistPath = path.join(rootPath, allowList)
    let whitelistRules: string[] = [...globalWhitelistRules]

    if (fs.existsSync(whitelistPath)) {
      const whitelistContent = fs.readFileSync(whitelistPath, 'utf8')
      const newRules: string[] = whitelistContent
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((pattern) => {
          // Handle directory patterns
          if (pattern.endsWith('/') || pattern.endsWith('\\')) {
            return pattern + '**'
          }
          return pattern
        })
      whitelistRules = whitelistRules.concat(newRules)
    }
    return whitelistRules
  } catch (error: any) {
    throw new Error(`Error getting whitelist rules: ${error.message}`)
  }
}

function generateProjectStructure(
  rootPath: string,
  ignoreRules: ReturnType<typeof ignore>
): string {
  let result = ''

  function addToStructure(currentPath: string, indent: string = ''): void {
    try {
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
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Error generating project structure: ${error.message}`
      )
    }
  }

  addToStructure(rootPath)
  return result
}

// TODO: separate ignore rules via comma
async function createExpIgnore() {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) {
      throw new Error('No workspace folder open')
    }

    const rootPath = workspaceFolder.uri.fsPath
    const config = await getConfig(rootPath)
    const expIgnorePath = path.join(rootPath, config.ignoreFile)

    if (fs.existsSync(expIgnorePath)) {
      const choice = await vscode.window.showQuickPick(
        ['Overwrite', 'Append', 'Cancel'],
        {
          placeHolder: `${config.ignoreFile} already exists. What would you like to do?`,
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
          vscode.window.showInformationMessage(`${config.ignoreFile} updated`)
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
      fs.writeFileSync(expIgnorePath, ignoreList.join('\n') + '\n')
      vscode.window.showInformationMessage(`${config.ignoreFile} created`)
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Error creating ignoreFile: ${error.message}`
    )
  }
}

async function createExpWhitelist() {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) {
      throw new Error('No workspace folder open')
    }

    const rootPath = workspaceFolder.uri.fsPath
    const config = await getConfig(rootPath)
    const expWhitelistPath = path.join(rootPath, config.allowList)

    if (fs.existsSync(expWhitelistPath)) {
      const choice = await vscode.window.showQuickPick(
        ['Overwrite', 'Append', 'Cancel'],
        {
          placeHolder: `${config.allowList} already exists. What would you like to do?`,
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
            fs.appendFileSync(expWhitelistPath, `${item}\n`)
          }
          vscode.window.showInformationMessage(`${config.allowList} updated`)
        }
        return
      }
    }

    const content = await vscode.window.showInputBox({
      prompt: 'Enter patterns to whitelist (separate via comma)',
    })

    if (content) {
      let whitelistList = content.split(',')
      whitelistList = whitelistList.map((item) => item.trim())
      fs.writeFileSync(expWhitelistPath, whitelistList.join('\n') + '\n')
      vscode.window.showInformationMessage(`${config.allowList} created`)
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error creating allowList: ${error.message}`)
  }
}

async function exportActiveTabs() {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) {
      throw new Error('No workspace folder open')
    }

    const rootPath = workspaceFolder.uri.fsPath
    const config = await getConfig(rootPath)
    const outputPath = await ensureOutputPath(
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
      const isIgnored = ignoreRules.ignores(relativePath)

      if (isIgnored && !config.allowIgnoredOnTabsExport) {
        const includeIgnored = await vscode.window.showQuickPick(
          ['Yes', 'No'],
          {
            placeHolder: `${relativePath} is ignored. Include it anyway?`,
          }
        )
        if (includeIgnored !== 'Yes') {
          continue
        }
      }

      let content = fs.readFileSync(filePath, 'utf8')
      if (config.removeComments) {
        content = stripComments(content)
      }
      output.push(
        `## ${relativePath}\n\n\`\`\`\n${content.trimRight()}\n\`\`\`\n\n`
      )
    }

    fs.writeFileSync(outputPath, output.join(''))
    vscode.window.showInformationMessage(
      `Active tabs exported to ${outputPath}`
    )
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Error exporting active tabs: ${error.message}`
    )
  }
}

async function ensureOutputPath(
  rootPath: string,
  outputPath: string
): Promise<string> {
  try {
    const fullPath = path.join(rootPath, outputPath)
    const outputDir = path.dirname(fullPath)

    if (!fs.existsSync(outputDir)) {
      const createDir = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: `Output directory ${outputDir} does not exist. Create it?`,
      })

      if (createDir === 'Yes') {
        fs.mkdirSync(outputDir, { recursive: true })
      } else {
        throw new Error('Output directory does not exist and was not created.')
      }
    }

    return fullPath
  } catch (error: any) {
    throw new Error(`Error ensuring output path: ${error.message}`)
  }
}

async function openExtensionSettings() {
  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    'Export Directory to File'
  )
}

export function deactivate() {}
