import * as fs from 'fs'
import * as path from 'path'

export interface Config {
  ignoreFile: string
  includeFile: string
  includeProjectStructure?: boolean
  output: string
  removeComments?: boolean
  allowIgnoredOnTabsExport?: boolean
  maxFileSize?: number
  description?:
    | string
    | {
        main?: string
        activeTabs?: string
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
      includeProjectStructure: true,
      output: 'export.md',
      removeComments: false,
      allowIgnoredOnTabsExport: false,
      maxFileSize: 1024 * 1024,
      description: {
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
    let description = ''

    if (typeof config.description === 'string') {
      description = config.description
    } else if (config.description && typeof config.description === 'object') {
      description = config.description[type] || ''
    }

    if (description && fs.existsSync(path.join(this.rootPath, description))) {
      return fs.readFileSync(path.join(this.rootPath, description), 'utf8')
    }

    return description
  }
}
