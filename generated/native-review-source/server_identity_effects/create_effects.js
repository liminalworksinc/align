'use strict';

function create_effects(resources) {
  const { config, emailApi, turnstile, postEmail, dbDir, path, mkdirSync,
    writeFileSync, chmodSync, captcha, V2Error, readURLSearchParams,
    readConsole, readFetch, readAbortSignal } = resources;
  const SIGN_IN_SUBJECT = 'Your Align sign-in code';
  const CAPTCHA_HEADER = 'x-captcha-response';

  function signInLink(origin, email, code) {
    const URLSearchParams = readURLSearchParams();
    return `${origin}/app/sign-in?${new URLSearchParams({ email, code })}`;
  }

  function signInFile() {
    return path.join(dbDir(), 'sign-in.txt');
  }

  async function sendSignInCode(email, code, origin) {
    const link = signInLink(origin, email, code);
    if (!config().hosted) {
      const line = `Align sign-in for ${email}: ${link}`;
      readConsole().log(line);
      const file = signInFile();
      mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      writeFileSync(file, `${line}\n`, { mode: 0o600 });
      chmodSync(file, 0o600);
      return;
    }
    const settings = emailApi();
    if (!settings) throw new Error('Email sign-in is not configured');
    await postEmail(settings, {
      to: email,
      subject: SIGN_IN_SUBJECT,
      text: `Your Align sign-in code is ${code}. It works for 5 minutes.\n\nOr open this link to fill it in, then press Sign in: ${link}\n\nIf you didn't ask to sign in to Align, ignore this email.`,
    }, 'Sign-in email');
  }

  function captchaPlugin() {
    const settings = turnstile();
    if (!settings) return null;
    return captcha({
      provider: 'cloudflare-turnstile',
      secretKey: settings.secretKey,
      siteVerifyURLOverride: settings.verifyUrl,
      endpoints: ['/email-otp/send-verification-otp', '/sign-in/email-otp'],
      allowedHostnames: [...config().allowedHosts],
    });
  }

  async function requireCaptcha(req) {
    const settings = turnstile();
    if (!settings) return;
    const token = req.headers.get(CAPTCHA_HEADER);
    if (!token || token.length > 4096) {
      throw new V2Error(400, 'captcha_required', 'Complete the check that you are a person, then try again.');
    }
    let data;
    try {
      const res = await readFetch()(settings.verifyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: settings.secretKey, response: token,
          remoteip: req.headers.get('fly-client-ip') ?? undefined }),
        signal: readAbortSignal().timeout(10000),
        redirect: 'error',
      });
      data = res.ok ? await res.json() : null;
    } catch (error) {
      readConsole().error('Captcha check failed:', error?.name ?? 'unknown');
    }
    if (!data) {
      throw new V2Error(503, 'captcha_unavailable', "The check that you are a person isn't working right now. Try again in a minute.");
    }
    if (!(data.success === true && data.hostname &&
      [...config().allowedHosts].includes(data.hostname.toLowerCase()))) {
      throw new V2Error(403, 'captcha_failed', "The check that you are a person didn't pass. Try it again.");
    }
  }

  return { SIGN_IN_SUBJECT, CAPTCHA_HEADER, signInLink, signInFile,
    sendSignInCode, captchaPlugin, requireCaptcha };
}

module.exports = { create_effects };
