/**
 * Evolution API client.
 * Docs: https://doc.evolution-api.com/
 */
export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instance: string;
}

export class EvolutionClient {
  constructor(private cfg: EvolutionConfig) {}

  private headers() {
    return {
      'Content-Type': 'application/json',
      apikey: this.cfg.apiKey,
    };
  }

  private url(path: string) {
    return `${this.cfg.baseUrl.replace(/\/$/, '')}${path}`;
  }

  async sendText(to: string, text: string): Promise<{ id?: string }> {
    const number = to.replace(/\D/g, '');
    const res = await fetch(this.url(`/message/sendText/${this.cfg.instance}`), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ number, text }),
    });
    if (!res.ok) throw new Error(`Evolution sendText failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { key?: { id?: string } };
    return { id: data?.key?.id };
  }

  async sendButtons(
    to: string,
    text: string,
    buttons: Array<{ id: string; title: string }>,
    footer?: string,
  ): Promise<{ id?: string }> {
    const number = to.replace(/\D/g, '');
    const res = await fetch(this.url(`/message/sendButtons/${this.cfg.instance}`), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        number,
        title: text,
        description: text,
        footer: footer ?? '',
        buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
      }),
    });
    if (!res.ok) {
      // Fallback to text if buttons unsupported
      return this.sendText(to, `${text}\n\n${buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n')}`);
    }
    const data = (await res.json()) as { key?: { id?: string } };
    return { id: data?.key?.id };
  }

  async sendImage(to: string, imageUrl: string, caption?: string): Promise<{ id?: string }> {
    const number = to.replace(/\D/g, '');
    const res = await fetch(this.url(`/message/sendMedia/${this.cfg.instance}`), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        number,
        mediatype: 'image',
        media: imageUrl,
        caption: caption ?? '',
      }),
    });
    if (!res.ok) throw new Error(`Evolution sendImage failed: ${res.status}`);
    const data = (await res.json()) as { key?: { id?: string } };
    return { id: data?.key?.id };
  }
}

export function evolutionFromEnv(): EvolutionClient {
  return new EvolutionClient({
    baseUrl: process.env.EVOLUTION_API_URL ?? 'http://localhost:8080',
    apiKey: process.env.EVOLUTION_API_KEY ?? '',
    instance: process.env.EVOLUTION_INSTANCE ?? 'thalimate',
  });
}
