import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import ignore, { Ignore } from 'ignore'
import { minimatch } from 'minimatch'
import stripComments from 'strip-comments'

let outputChannel: vscode.OutputChannel

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Directory2File')

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'directory2file.exportToFile',
      exportToMarkdown
    ),
    vscode.commands.registerCommand(
      'directory2file.createIgnore',
      createExpIgnore
    ),
    vscode.commands.registerCommand(
      'directory2file.createInclude',
      createExpInclude
    ),
    vscode.commands.registerCommand(
      'directory2file.exportActiveTabs',
      exportActiveTabs
    ),
    vscode.commands.registerCommand(
      'directory2file.openSettings',
      openExtensionSettings
    ),
    outputChannel
  )
}

async function exportToMarkdown(context: vscode.ExtensionContext) {
  console.log('Starting exportToMarkdown function')
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
  }

  const rootPath = workspaceFolder.uri.fsPath
  console.log('Root path:', rootPath)

  const config = await getConfig(rootPath)
  console.log('Config:', config)

  const outputPath = await ensureOutputPath(rootPath, config.output)
  console.log('Output path:', outputPath)

  const ignoreRules = await getIgnoreRules(rootPath, config.ignoreFile)
  const includeRules = await getIncludeRules(rootPath, config.includeFile)

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Exporting directory to file',
      cancellable: true,
    },
    async (progress, token) => {
      try {
        const fileCounts = await getDirectoryFileCounts(
          rootPath,
          rootPath,
          ignoreRules,
          includeRules
        )
        const totalFiles = Object.values(fileCounts).reduce(
          (sum, count) => sum + count,
          0
        )
        console.log('Total files:', totalFiles)

        if (totalFiles > 1000) {
          const proceed = await vscode.window.showWarningMessage(
            `This directory contains ${totalFiles} files. Exporting may take a long time. Proceed?`,
            'Yes',
            'No'
          )
          if (proceed !== 'Yes') {
            return
          }
        }

        let output: string[] = []
        if (config.description) {
          output.push(await getDescription(rootPath, config.description))
        }

        if (config.includeProjectStructure) {
          output.push('# Project Structure\n\n```\n')
          output.push(
            await generateProjectStructure(rootPath, ignoreRules, includeRules)
          )
          output.push('```\n\n')
        }

        output.push('# File Contents\n\n')

        await processDirectory(
          rootPath,
          rootPath,
          ignoreRules,
          includeRules,
          output,
          config.removeComments ?? false,
          progress,
          token,
          config.maxFileSize ?? 1024 * 1024 // 1MB default
        )

        if (!token.isCancellationRequested) {
          await vscode.workspace.fs.writeFile(
            vscode.Uri.file(outputPath),
            Buffer.from(output.join(''))
          )
          vscode.window.showInformationMessage(
            `Files exported to ${outputPath}`
          )
        }
      } catch (error: any) {
        console.error('Error in exportToMarkdown:', error)
        if (error instanceof vscode.CancellationError) {
          vscode.window.showInformationMessage('Export operation was cancelled')
        } else {
          vscode.window.showErrorMessage(
            `Error exporting files: ${error.message}`
          )
        }
      }
    }
  )
}

async function processDirectory(
  dirPath: string,
  rootPath: string,
  ignoreRules: Ignore,
  includeRules: string[],
  output: string[],
  removeComments: boolean,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  token: vscode.CancellationToken,
  maxFileSize: number = 1024 * 1024 // 1MB default
): Promise<void> {
  console.log('Processing directory:', dirPath)
  if (token.isCancellationRequested) {
    throw new vscode.CancellationError()
  }

  const relativePath = path.relative(rootPath, dirPath)
  console.log('Relative path:', relativePath)

  // Only check ignoreRules if relativePath is not empty
  if (relativePath && ignoreRules.ignores(relativePath)) {
    console.log(`Ignoring directory: ${relativePath}`)
    return
  }

  try {
    const files = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(dirPath)
    )
    for (const [file, fileType] of files) {
      const filePath = path.join(dirPath, file)
      const fileRelativePath = path.relative(rootPath, filePath)

      if (token.isCancellationRequested) {
        throw new vscode.CancellationError()
      }

      console.log('Processing:', fileRelativePath)

      // Only check ignoreRules if fileRelativePath is not empty
      if (fileRelativePath && ignoreRules.ignores(fileRelativePath)) {
        console.log('Ignoring file:', fileRelativePath)
        continue
      }

      if (shouldIncludeFile(fileRelativePath, includeRules)) {
        if (fileType === vscode.FileType.Directory) {
          await processDirectory(
            filePath,
            rootPath,
            ignoreRules,
            includeRules,
            output,
            removeComments,
            progress,
            token,
            maxFileSize
          )
        } else if (fileType === vscode.FileType.File) {
          try {
            const stats = await vscode.workspace.fs.stat(
              vscode.Uri.file(filePath)
            )
            if (stats.size > maxFileSize) {
              console.log(
                `Skipping large file: ${fileRelativePath} (${stats.size} bytes)`
              )
              continue
            }

            const content = await vscode.workspace.fs.readFile(
              vscode.Uri.file(filePath)
            )
            let fileContent = new TextDecoder().decode(content)
            const fileExtension = path.extname(file).slice(1)

            if (removeComments) {
              try {
                const supportedLanguages = vscode.workspace
                  .getConfiguration('directory2file')
                  .get('stripCommentsFromExtensions', [
                    'js',
                    'ts',
                    'jsx',
                    'tsx',
                    'css',
                    'less',
                    'scss',
                    'html',
                    'xml',
                    'svg',
                    'yaml',
                    'yml',
                    'py',
                    'rb',
                    'php',
                    'java',
                    'c',
                    'cpp',
                    'cs',
                    'go',
                    'rs',
                    'swift',
                    'kt',
                  ])

                if (supportedLanguages.includes(fileExtension.toLowerCase())) {
                  fileContent = stripComments(fileContent, {
                    language: fileExtension,
                    preserveNewlines: true,
                  })
                  console.log(`Comments stripped from ${fileRelativePath}`)
                } else {
                  console.log(
                    `Skipping comment stripping for unsupported language: ${fileExtension} (${fileRelativePath})`
                  )
                }
              } catch (error: any) {
                console.warn(
                  `Warning: Unable to strip comments from ${fileRelativePath}:`,
                  error.message
                )
              }
            }

            output.push(
              `## ${fileRelativePath}\n\n\`\`\`${fileExtension}\n${fileContent.trimRight()}\n\`\`\`\n\n`
            )
            progress.report({
              increment: 100 / files.length,
              message: `Processing: ${fileRelativePath}`,
            })
          } catch (error: any) {
            console.error(`Error processing file ${fileRelativePath}:`, error)
            vscode.window.showErrorMessage(
              `Error processing file ${fileRelativePath}: ${error.message}`
            )
          }
        }
      } else {
        console.log('File not included:', fileRelativePath)
      }
    }
  } catch (error: any) {
    console.error(`Error processing directory ${dirPath}:`, error)
    vscode.window.showErrorMessage(
      `Error processing directory ${dirPath}: ${error.message}`
    )
  }
}

async function getDirectoryFileCounts(
  dirPath: string,
  rootPath: string,
  ignoreRules: Ignore,
  includeRules: string[]
): Promise<Record<string, number>> {
  console.log('getDirectoryFileCounts called with:', { dirPath, rootPath })
  const counts: Record<string, number> = {}
  const relativePath = path.relative(rootPath, dirPath)
  console.log('Relative path:', relativePath)

  if (!dirPath || !rootPath) {
    console.error('Empty path detected:', { dirPath, rootPath })
    return counts
  }

  if (relativePath && ignoreRules.ignores(relativePath)) {
    console.log(`Ignoring directory: ${relativePath}`)
    return counts
  }

  try {
    const files = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(dirPath)
    )

    for (const [file, fileType] of files) {
      const filePath = path.join(dirPath, file)
      const fileRelativePath = path.relative(rootPath, filePath)
      console.log('Processing file:', {
        file,
        fileType,
        filePath,
        fileRelativePath,
      })

      if (!fileRelativePath) {
        console.warn('File relative path is empty:', { filePath, rootPath })
        continue
      }

      const isIgnored = ignoreRules.ignores(fileRelativePath)
      const isIncluded = shouldIncludeFile(fileRelativePath, includeRules)

      if (!isIgnored || isIncluded) {
        if (fileType === vscode.FileType.Directory) {
          if (!isIgnored) {
            const subCounts = await getDirectoryFileCounts(
              filePath,
              rootPath,
              ignoreRules,
              includeRules
            )
            Object.entries(subCounts).forEach(([subDir, count]) => {
              counts[subDir] = (counts[subDir] || 0) + count
            })
          }
        } else {
          const dirName = path.dirname(fileRelativePath)
          counts[dirName] = (counts[dirName] || 0) + 1
        }
      }
    }
  } catch (error: any) {
    console.error('Error in getDirectoryFileCounts:', error)
    console.error('Error details:', { dirPath, rootPath })
  }

  return counts
}

async function getConfig(rootPath: string): Promise<{
  ignoreFile: string
  includeFile: string
  includeProjectStructure?: boolean
  output: string
  description?: string
  removeComments?: boolean
  allowIgnoredOnTabsExport?: boolean
  maxFileSize?: number // Add this line
}> {
  console.log('Getting config for rootPath:', rootPath)
  const configPath = path.join(rootPath, 'exportconfig.json')
  let config = {
    ignoreFile: '.export-ignore',
    includeFile: '.export-include',
    output: 'export.md',
    removeComments: false,
    allowIgnoredOnTabsExport: false,
    maxFileSize: 1024 * 1024, // Default to 1MB
  }
  if (fs.existsSync(configPath)) {
    console.log('Config file found:', configPath)
    const configContent = fs.readFileSync(configPath, 'utf8')
    console.log('Default config:', config)
    console.log('Config file content:', configContent)
    config = { ...config, ...JSON.parse(configContent) }
  } else {
    console.log('No config file found, using default config')
  }
  console.log('Final config:', config)
  return config
}

async function getIgnoreRules(
  rootPath: string,
  ignoreFile: string
): Promise<Ignore> {
  console.log('getIgnoreRules called with:', { rootPath, ignoreFile })
  const globalIgnoreRules = vscode.workspace
    .getConfiguration('directory2file')
    .get('globalIgnoreRules', []) as string[]
  console.log('Global ignore rules:', globalIgnoreRules)

  let ignoreRules = ignore()

  const ignorePath = path.join(rootPath, ignoreFile)
  console.log('Ignore file path:', ignorePath)
  if (fs.existsSync(ignorePath)) {
    console.log(`Reading ignore file from: ${ignorePath}`)
    const ignoreContent = fs.readFileSync(ignorePath, 'utf8')
    console.log(`Ignore file content:\n${ignoreContent}`)
    const customRules = ignoreContent
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    ignoreRules.add(customRules)
    console.log('Custom ignore rules:', customRules)
  } else {
    console.log('Ignore file does not exist, using default rules')
  }

  const defaultRules = [
    '.git',
    'node_modules',
    '.vscode',
    'dist',
    'out',
    '*.vsix',
  ]
  ignoreRules.add(defaultRules)
  console.log('Default ignore rules:', defaultRules)

  ignoreRules.add(globalIgnoreRules)

  // Test ignore rules
  console.log('Ignore test - .git:', ignoreRules.ignores('.git'))
  console.log('Ignore test - test.vsix:', ignoreRules.ignores('test.vsix'))

  return ignoreRules
}

function shouldIncludeFile(
  relativePath: string,
  includeRules: string[]
): boolean {
  if (!relativePath) {
    console.log('shouldIncludeFile: relativePath is empty')
    return false
  }

  if (includeRules.length === 0) {
    return true
  }

  return includeRules.some((rule) => {
    if (rule.endsWith('/**')) {
      const dirPath = rule.slice(0, -3)
      return relativePath.startsWith(dirPath)
    }
    return minimatch(relativePath, rule, { matchBase: true, dot: true })
  })
}

async function getIncludeRules(
  rootPath: string,
  includeFile: string
): Promise<string[]> {
  console.log('getIncludeRules called with:', { rootPath, includeFile })
  const globalIncludeRules: string[] = vscode.workspace
    .getConfiguration('directory2file')
    .get('globalIncludeRules', [])
  console.log('Global include rules:', globalIncludeRules)

  const includePath = path.join(rootPath, includeFile)
  let includeRules: string[] = [...globalIncludeRules]

  if (fs.existsSync(includePath)) {
    console.log(`Reading include file from: ${includePath}`)
    const includeContent = fs.readFileSync(includePath, 'utf8')
    console.log(`Include file content:\n${includeContent}`)
    const newRules: string[] = includeContent
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((pattern) => pattern.trim())
    includeRules = includeRules.concat(newRules)
  } else {
    console.log('Include file does not exist')
  }

  console.log('Final include rules:', includeRules)
  return includeRules
}

async function generateProjectStructure(
  rootPath: string,
  ignoreRules: Ignore,
  includeRules: string[]
): Promise<string> {
  console.log('Generating project structure')
  let result = ''

  async function addToStructure(
    currentPath: string,
    indent: string = ''
  ): Promise<void> {
    const files = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(currentPath)
    )
    files.sort((a, b) => {
      const aIsDir = a[1] === vscode.FileType.Directory
      const bIsDir = b[1] === vscode.FileType.Directory
      if (aIsDir && !bIsDir) {
        return -1
      }
      if (!aIsDir && bIsDir) {
        return 1
      }
      return a[0].localeCompare(b[0])
    })

    for (const [file, fileType] of files) {
      const filePath = path.join(currentPath, file)
      const relativePath = path.relative(rootPath, filePath)

      // Only check ignoreRules if relativePath is not empty
      if (relativePath && ignoreRules.ignores(relativePath)) {
        console.log(`Ignoring in structure: ${relativePath}`)
        continue
      }

      if (shouldIncludeFile(relativePath, includeRules)) {
        if (fileType === vscode.FileType.Directory) {
          result += `${indent}${file}/\n`
          await addToStructure(filePath, indent + '  ')
        } else {
          result += `${indent}${file}\n`
        }
      }
    }
  }

  await addToStructure(rootPath)
  console.log('Project structure generated')
  return result
}

async function createExpIgnore() {
  console.log('Creating .export-ignore file')
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
  }

  const rootPath = workspaceFolder.uri.fsPath
  const config = await getConfig(rootPath)
  const expIgnorePath = path.join(rootPath, config.ignoreFile)

  if (fs.existsSync(expIgnorePath)) {
    console.log('Existing .export-ignore file found')
    const choice = await vscode.window.showQuickPick(
      ['Overwrite', 'Append', 'Cancel'],
      {
        placeHolder: `${config.ignoreFile} already exists. What would you like to do?`,
      }
    )

    if (choice === 'Cancel' || !choice) {
      console.log('User cancelled operation')
      return
    }

    if (choice === 'Append') {
      const content = await vscode.window.showInputBox({
        prompt: 'Enter patterns to ignore (separate via comma)',
      })
      if (content) {
        const ignoreFile = content.split(',').map((item) => item.trim())
        fs.appendFileSync(expIgnorePath, ignoreFile.join('\n') + '\n')
        console.log('Appended to .export-ignore file')
        vscode.window.showInformationMessage(`${config.ignoreFile} updated`)
      }
      return
    }
  }

  const gitignorePath = path.join(rootPath, '.gitignore')
  let initialContent = ''
  if (fs.existsSync(gitignorePath)) {
    console.log('Existing .gitignore file found')
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
    const ignoreFile = content.split(',').map((item) => item.trim())
    fs.writeFileSync(expIgnorePath, ignoreFile.join('\n') + '\n')
    console.log('Created .export-ignore file')
    vscode.window.showInformationMessage(`${config.ignoreFile} created`)
  }
}

async function createExpInclude() {
  console.log('Creating .export-include file')
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
  }

  const rootPath = workspaceFolder.uri.fsPath
  const config = await getConfig(rootPath)
  const expIncludePath = path.join(rootPath, config.includeFile)

  if (fs.existsSync(expIncludePath)) {
    console.log('Existing .export-include file found')
    const choice = await vscode.window.showQuickPick(
      ['Overwrite', 'Append', 'Cancel'],
      {
        placeHolder: `${config.includeFile} already exists. What would you like to do?`,
      }
    )

    if (choice === 'Cancel' || !choice) {
      console.log('User cancelled operation')
      return
    }

    if (choice === 'Append') {
      const content = await vscode.window.showInputBox({
        prompt: 'Enter patterns to include (separate via comma)',
      })
      if (content) {
        const includeFile = content.split(',').map((item) => item.trim())
        fs.appendFileSync(expIncludePath, includeFile.join('\n') + '\n')
        console.log('Appended to .export-include file')
        vscode.window.showInformationMessage(`${config.includeFile} updated`)
      }
      return
    }
  }

  const content = await vscode.window.showInputBox({
    prompt: 'Enter patterns to include (separate via comma)',
  })

  if (content) {
    const includeFile = content.split(',').map((item) => item.trim())
    fs.writeFileSync(expIncludePath, includeFile.join('\n') + '\n')
    console.log('Created .export-include file')
    vscode.window.showInformationMessage(`${config.includeFile} created`)
  }
}

async function exportActiveTabs() {
  console.log('Exporting active tabs')
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
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

  console.log('Active tabs:', activeTabs)

  const ignoreRules = await getIgnoreRules(rootPath, config.ignoreFile)
  const includeRules = await getIncludeRules(rootPath, config.includeFile)

  if (config.includeProjectStructure) {
    output.push('# Project Structure\n\n```\n')
    output.push(
      await generateProjectStructure(rootPath, ignoreRules, includeRules)
    )
    output.push('```\n\n')
  }

  output.push('# Active Tabs Content\n\n')

  for (const filePath of activeTabs) {
    const relativePath = path.relative(rootPath, filePath)
    const isIgnored = ignoreRules.ignores(relativePath)
    const shouldInclude = shouldIncludeFile(relativePath, includeRules)

    console.log(
      `Processing tab: ${relativePath}, Ignored: ${isIgnored}, Included: ${shouldInclude}`
    )

    if ((isIgnored && !config.allowIgnoredOnTabsExport) || !shouldInclude) {
      const includeIgnored = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: `${relativePath} is ignored or not included. Include it anyway?`,
      })
      if (includeIgnored !== 'Yes') {
        console.log(`Skipping ignored/not included file: ${relativePath}`)
        continue
      }
    }

    let content = fs.readFileSync(filePath, 'utf8')
    if (config.removeComments) {
      try {
        content = stripComments(content)
      } catch (error: any) {
        console.error(`Error stripping comments from ${filePath}:`, error)
      }
    }
    const fileExtension = path.extname(filePath).slice(1)
    output.push(
      `## ${relativePath}\n\n\`\`\`${fileExtension}\n${content.trimRight()}\n\`\`\`\n\n`
    )
  }

  fs.writeFileSync(outputPath, output.join(''))
  console.log(`Active tabs exported to ${outputPath}`)
  vscode.window.showInformationMessage(`Active tabs exported to ${outputPath}`)
}

async function ensureOutputPath(
  rootPath: string,
  outputPath: string
): Promise<string> {
  console.log('Ensuring output path:', { rootPath, outputPath })
  if (!rootPath || !outputPath) {
    throw new Error('Root path or output path is empty')
  }

  const fullPath = path.join(rootPath, outputPath)
  const outputDir = path.dirname(fullPath)

  if (!fs.existsSync(outputDir)) {
    console.log(`Output directory does not exist: ${outputDir}`)
    const createDir = await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: `Output directory ${outputDir} does not exist. Create it?`,
    })

    if (createDir === 'Yes') {
      fs.mkdirSync(outputDir, { recursive: true })
      console.log(`Created output directory: ${outputDir}`)
    } else {
      console.log('User chose not to create output directory')
      throw new Error('Output directory does not exist and was not created.')
    }
  }

  console.log('Final output path:', fullPath)
  return fullPath
}

async function openExtensionSettings() {
  console.log('Opening extension settings')
  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    'Export Directory to File'
  )
}

async function countFiles(
  dirPath: string,
  rootPath: string,
  ignoreRules: Ignore,
  includeRules: string[]
): Promise<number> {
  console.log('Counting files in:', dirPath)
  let count = 0
  const relativePath = path.relative(rootPath, dirPath)

  // Check if the current directory should be ignored
  if (ignoreRules.ignores(relativePath)) {
    console.log(`Ignoring directory: ${relativePath}`)
    return 0
  }

  const files = await vscode.workspace.fs.readDirectory(
    vscode.Uri.file(dirPath)
  )
  for (const [file, fileType] of files) {
    const filePath = path.join(dirPath, file)
    const fileRelativePath = path.relative(rootPath, filePath)

    if (
      !ignoreRules.ignores(fileRelativePath) ||
      shouldIncludeFile(fileRelativePath, includeRules)
    ) {
      if (fileType === vscode.FileType.Directory) {
        count += await countFiles(filePath, rootPath, ignoreRules, includeRules)
      } else if (
        fileType === vscode.FileType.File &&
        shouldIncludeFile(fileRelativePath, includeRules)
      ) {
        count++
      }
    }
  }
  console.log(`File count in ${dirPath}:`, count)
  return count
}

async function getDescription(
  rootPath: string,
  description: string
): Promise<string> {
  console.log('Getting description:', { rootPath, description })
  const descriptionPath = path.join(rootPath, description)
  if (fs.existsSync(descriptionPath)) {
    console.log('Description file found:', descriptionPath)
    return fs.readFileSync(descriptionPath, 'utf8') + '\n\n'
  }
  console.log('No description file found, using provided description')
  return description + '\n\n'
}

export function deactivate() {
  console.log('Directory2File extension deactivated')
}
