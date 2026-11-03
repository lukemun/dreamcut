// Build-time configuration only. Credentials never enter the application manifest.
export function releaseConfiguration({ argv = [], env = {}, version, arch, platform = process.platform }) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version || '')) throw Error('Invalid desktop release version.');
  if (!['arm64', 'x64'].includes(arch)) throw Error('Unsupported desktop release architecture.');
  if (!['darwin','win32'].includes(platform)) throw Error('Unsupported desktop platform.');
  if (platform === 'win32' && (argv.includes('--sign') || argv.includes('--notarize') || (env.DREAMCUT_RELEASE_CHANNEL && env.DREAMCUT_RELEASE_CHANNEL !== 'local'))) throw Error('Windows qualification builds are unsigned and local; signing and updates require separate qualification.');
  const sign = argv.includes('--sign'), notarize = argv.includes('--notarize');
  if (notarize && !sign) throw Error('Notarization requires --sign.');
  const channel = env.DREAMCUT_RELEASE_CHANNEL || 'local';
  if (!['local', 'preview', 'stable'].includes(channel)) throw Error('Invalid desktop release channel.');
  if (channel !== 'local' && !sign) throw Error('Update channels require a signed build.');
  const identity = sign ? env.DREAMCUT_SIGN_IDENTITY?.trim() : undefined;
  if (sign && (!identity || identity === '-')) throw Error('Set a Developer ID signing identity before signing.');
  const keychainProfile = notarize ? env.DREAMCUT_NOTARY_PROFILE?.trim() : undefined;
  if (notarize && !keychainProfile) throw Error('Set a notarization Keychain profile before notarizing.');
  let feedUrl = null;
  if (channel !== 'local') {
    let feed;
    try { feed = new URL(env.DREAMCUT_UPDATE_FEED); } catch { throw Error('Set an HTTPS update feed for this channel and architecture.'); }
    if (feed.protocol !== 'https:' || feed.username || feed.password || feed.hash || feed.search) throw Error('Update feeds require HTTPS without credentials, query or fragment.');
    feedUrl = feed.href;
  }
  return { sign, notarize, identity, keychainProfile,
    manifest: { schemaVersion: 1, version, platform, arch, channel, feedUrl } };
}
