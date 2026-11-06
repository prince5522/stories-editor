
/* =========================================
   STORY STUDIO AUTHENTICATION
   Email + Password
   Persistent Supabase session
   Login page only
========================================= */

(() => {
  'use strict';

  const PROJECT_URL =
    'https://fkyihttehxinegibcwws.supabase.co';

  const PUBLISHABLE_KEY =
    'sb_publishable_N54NlBxYHQgpiKr7oy2oRQ_yfe_E1dV';

  const $ = id => document.getElementById(id);

  const form = $('loginForm');
  const emailInput = $('email');
  const passwordInput = $('password');
  const submitButton = $('submitButton');
  const runway = $('runway');
  const message = $('loginMessage');

  const formHeading = $('formHeading');
  const formDescription = $('formDescription');
  const accountSwitch = $('accountSwitch');
  const switchModeButton = $('switchMode');
  const forgotButton = $('forgotPassword');

  let mode = 'login';
  let client = null;
  let busy = false;

  /* ---------------------------------------
     MESSAGES
  --------------------------------------- */

  function showMessage(text, success = false) {
    message.textContent = text;
    message.className =
      'login-message' + (success ? ' success' : '');

    message.style.display = 'block';
  }

  function clearMessage() {
    message.textContent = '';
    message.style.display = 'none';
    message.className = 'login-message';
  }

  /* ---------------------------------------
     BUTTON STATE
  --------------------------------------- */

  function setLoading(loading, text = '') {
    busy = loading;

    submitButton.disabled = loading;
    runway.classList.toggle('loading', loading);

    if (loading) {
      submitButton.textContent = text || 'Please wait…';
    } else {
      updateButtonText();
    }
  }

  function updateButtonText() {
    const labels = {
      login: 'Log in ↗',
      signup: 'Create account ↗',
      recovery: 'Save new password ↗'
    };

    submitButton.textContent = labels[mode];
  }

  /* ---------------------------------------
     FORM MODES
  --------------------------------------- */

  function setMode(nextMode) {
    mode = nextMode;
    clearMessage();

    const recovery = mode === 'recovery';

    emailInput.closest('.field').hidden = recovery;
    forgotButton.hidden = mode !== 'login';

    passwordInput.value = '';

    if (mode === 'login') {
      formHeading.textContent = 'Sign in';

      formDescription.textContent =
        'Welcome back. Sign in to continue creating and managing your stories.';

      passwordInput.placeholder = 'Your password';
      passwordInput.autocomplete = 'current-password';

      accountSwitch.hidden = false;
      accountSwitch.innerHTML =
        'No account yet? <button id="switchMode" type="button">Create one</button>';

    } else if (mode === 'signup') {
      formHeading.textContent = 'Create account';

      formDescription.textContent =
        'Create your Story Studio account and keep your workspace connected.';

      passwordInput.placeholder = 'At least 8 characters';
      passwordInput.autocomplete = 'new-password';

      accountSwitch.hidden = false;
      accountSwitch.innerHTML =
        'Already have an account? <button id="switchMode" type="button">Sign in</button>';

    } else {
      formHeading.textContent = 'New password';

      formDescription.textContent =
        'Choose a new password for your Story Studio account.';

      passwordInput.placeholder = 'Enter your new password';
      passwordInput.autocomplete = 'new-password';

      accountSwitch.hidden = true;
    }

    updateButtonText();
    connectSwitchButton();
  }

  function connectSwitchButton() {
    const button = $('switchMode');

    if (!button) return;

    button.addEventListener('click', () => {
      setMode(mode === 'login' ? 'signup' : 'login');
    });
  }

  /* ---------------------------------------
     NAVIGATION
  --------------------------------------- */

  function openHome() {
    window.location.replace('home.html');
  }

  /* ---------------------------------------
     PASSWORD VISIBILITY
  --------------------------------------- */

  $('togglePassword').addEventListener('click', () => {
    const visible = passwordInput.type === 'text';

    passwordInput.type = visible ? 'password' : 'text';

    $('togglePassword').textContent =
      visible ? '◉' : '◎';

    $('togglePassword').setAttribute(
      'aria-label',
      visible ? 'Show password' : 'Hide password'
    );
  });

  /* ---------------------------------------
     PASSWORD RECOVERY
  --------------------------------------- */

  forgotButton.addEventListener('click', async () => {
    clearMessage();

    const email = emailInput.value.trim();

    if (!email || !emailInput.checkValidity()) {
      showMessage('Enter your account email first.');
      emailInput.focus();
      return;
    }

    setLoading(true, 'Sending link…');

    try {
      const { error } =
        await client.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.href.split('?')[0]
        });

      if (error) throw error;

      showMessage(
        'If this email belongs to an account, a password reset link has been sent. Check your inbox.',
        true
      );

    } catch (error) {
      showMessage(error.message || 'Could not send the reset email.');
    } finally {
      setLoading(false);
    }
  });

  /* ---------------------------------------
     ACCOUNT CREATION
  --------------------------------------- */

  async function createAccount(email, password) {
    const {
      data: { session }
    } = await client.auth.getSession();

    /*
      If this browser already has the anonymous
      Supabase identity used by the cloud library,
      convert that identity to email/password.

      This helps preserve its existing owner ID
      and associated Ready-Made cloud episodes.
    */

    if (session?.user?.is_anonymous) {
      const { data, error } =
        await client.auth.updateUser({
          email,
          password
        });

      if (error) throw error;

      if (data.user && !data.user.is_anonymous) {
        showMessage(
          'Your account is ready. Opening Story Studio…',
          true
        );

        setTimeout(openHome, 700);
        return;
      }

      showMessage(
        'Check your email to confirm your address. After confirmation, return and sign in.',
        true
      );

      return;
    }

    /* Normal email/password registration */

    const { data, error } =
      await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            window.location.href.split('?')[0]
        }
      });

    if (error) throw error;

    if (data.session) {
      showMessage(
        'Account created successfully. Opening Story Studio…',
        true
      );

      setTimeout(openHome, 700);
    } else {
      showMessage(
        'Account created. Check your email for the confirmation link, then return here to sign in.',
        true
      );

      setMode('login');
      emailInput.value = email;
    }
  }

  /* ---------------------------------------
     SIGN IN
  --------------------------------------- */

  async function signIn(email, password) {
    const { error } =
      await client.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;

    showMessage('Signed in successfully. Welcome back!', true);

    setTimeout(openHome, 500);
  }

  /* ---------------------------------------
     UPDATE PASSWORD AFTER RECOVERY
  --------------------------------------- */

  async function updatePassword(password) {
    const { error } =
      await client.auth.updateUser({
        password
      });

    if (error) throw error;

    showMessage(
      'Password updated successfully. Opening Story Studio…',
      true
    );

    setTimeout(openHome, 700);
  }

  /* ---------------------------------------
     FORM SUBMISSION
  --------------------------------------- */

  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (busy || !client) return;

    clearMessage();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (mode !== 'recovery') {
      if (!email || !emailInput.checkValidity()) {
        showMessage('Enter a valid email address.');
        emailInput.focus();
        return;
      }
    }

    if (!password || password.length < 8) {
      showMessage('Your password must contain at least 8 characters.');
      passwordInput.focus();
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        await signIn(email, password);

      } else if (mode === 'signup') {
        await createAccount(email, password);

      } else if (mode === 'recovery') {
        await updatePassword(password);
      }

    } catch (error) {
      console.error('Story Studio authentication:', error);

      showMessage(
        error.message || 'Something went wrong. Please try again.'
      );

    } finally {
      setLoading(false);
    }
  });

  /* ---------------------------------------
     INITIALIZE SUPABASE
  --------------------------------------- */

  async function initialize() {
    if (!window.supabase?.createClient) {
      showMessage(
        'The login service could not load. Connect to the internet and refresh this page.'
      );
      return;
    }

    try {
      client = window.supabase.createClient(
        PROJECT_URL,
        PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );

      /*
        Detect password recovery links.
      */

      client.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          setMode('recovery');
          showMessage(
            'Choose a new password for your account.',
            true
          );
        }
      });

      const {
        data: { session },
        error
      } = await client.auth.getSession();

      if (error) throw error;

      /*
        Existing permanent sessions go directly
        to Home. Anonymous sessions remain on
        the login screen so an email account can
        be created or an existing account used.
      */

      if (
        session?.user &&
        !session.user.is_anonymous &&
        !window.location.search.includes('type=recovery')
      ) {
        openHome();
        return;
      }

      if (window.location.search.includes('type=recovery')) {
        setMode('recovery');
        showMessage(
          'Choose a new password for your account.',
          true
        );
      }

    } catch (error) {
      console.error('Supabase initialization failed:', error);

      showMessage(
        'Could not connect to the login service. Please check your internet connection and try again.'
      );
    }
  }

  /* ---------------------------------------
     START
  --------------------------------------- */

  connectSwitchButton();
  updateButtonText();
  initialize();

})();
