import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js'
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { getMcpOauthRecord, setMcpOauthRecord } from './oauth-store'

/**
 * 持久化 OAuthClientProvider：tokens / clientInformation 写入 mcp-oauth.json。
 * codeVerifier 仅内存（单次授权流）。
 */
export class FileOAuthClientProvider implements OAuthClientProvider {
  private _codeVerifier?: string
  private _tokens?: OAuthTokens
  private _clientInformation?: OAuthClientInformationMixed
  private loaded = false

  constructor(
    private readonly opts: {
      serverId: string
      home: string
      redirectUrl: string
      onRedirect: (url: URL) => void | Promise<void>
      clientName?: string
    }
  ) {}

  get redirectUrl(): string {
    return this.opts.redirectUrl
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this.opts.clientName ?? 'shy',
      redirect_uris: [this.opts.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    const rec = await getMcpOauthRecord(this.opts.serverId, this.opts.home)
    if (rec?.tokens) this._tokens = rec.tokens
    if (rec?.clientInformation) this._clientInformation = rec.clientInformation
    this.loaded = true
  }

  private async persist(): Promise<void> {
    await setMcpOauthRecord(
      this.opts.serverId,
      {
        tokens: this._tokens,
        clientInformation: this._clientInformation
      },
      this.opts.home
    )
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    await this.ensureLoaded()
    return this._clientInformation
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    this._clientInformation = info
    await this.persist()
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    await this.ensureLoaded()
    return this._tokens
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this._tokens = tokens
    await this.persist()
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    await this.opts.onRedirect(authorizationUrl)
  }

  saveCodeVerifier(codeVerifier: string): void {
    this._codeVerifier = codeVerifier
  }

  codeVerifier(): string {
    if (!this._codeVerifier) throw new Error('No code verifier saved')
    return this._codeVerifier
  }
}
