import { Logger } from '@nestjs/common';

const logger = new Logger('WalletAlert');

// Reports a money problem that needs a person: a payment that does not match
// what was asked for, a refund or dispute, a card that stopped working. It is
// always logged at error level with a [wallet-alert] prefix, and also posted
// to Discord when WALLET_ALERT_WEBHOOK_URL (or DISCORD_WEBHOOK_URL) is set.
// Never mentions anyone, and never throws.
export const walletAlert = async (message: string) => {
  logger.error(`[wallet-alert] ${message}`);
  const url =
    process.env.WALLET_ALERT_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    return;
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `Wallet: ${message}`.slice(0, 1900),
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    logger.error(`[wallet-alert] could not post to Discord: ${err}`);
  }
};
