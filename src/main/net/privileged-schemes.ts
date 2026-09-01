/**
 * 自定义协议特权。必须在 app.whenReady 之前 registerSchemesAsPrivileged。
 *
 * shy-material 给 <video>/<audio> 用，必须 stream；renderer fetch 缩略图必须 corsEnabled。
 */
export const PRIVILEGED_SCHEMES: Array<{
  scheme: string
  privileges: {
    standard: boolean
    secure: boolean
    supportFetchAPI: boolean
    stream?: boolean
    corsEnabled?: boolean
  }
}> = [
  {
    scheme: 'shy-asset',
    privileges: { standard: true, secure: true, supportFetchAPI: false }
  },
  {
    scheme: 'shy-material',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
]
