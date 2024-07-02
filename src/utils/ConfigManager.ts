import * as fs from 'fs'
import * as path from 'path'

export interface Config {
  ignoreFile: string
  includeFile: string
  includeProjectStructure?: boolean
  output: string
  description?: string
  removeComments?: boolean
  allowIgnoredOnTabsExport?: boolean
  maxFileSize?: number
  descriptions: {
    main: string
    activeTabs: string
  }
}

export class ConfigManager {
  private rootPath: string

  constructor(rootPath: string) {
    this.rootPath = rootPath
  }

  async getConfig(): Promise<Config> {
    const configPath = path.join(this.rootPath, 'exportconfig.json')
    let config: Config = {
      ignoreFile: '.export-ignore',
      includeFile: '.export-include',
      output: 'export.md',
      removeComments: false,
      allowIgnoredOnTabsExport: false,
      maxFileSize: 1024 * 1024,
      descriptions: {
        main: '',
        activeTabs: '',
      },
    }

    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8')
      config = { ...config, ...JSON.parse(configContent) }
    }

    return config
  }

  async getDescription(type: 'main' | 'activeTabs'): Promise<string> {
    const config = await this.getConfig()
    const descriptionPath = config.descriptions[type]

    if (descriptionPath) {
      const fullPath = path.join(this.rootPath, descriptionPath)
      if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, 'utf8')
      }
    }

    return ''
  }
}
