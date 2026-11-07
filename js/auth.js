
/* =========================================
   STORY STUDIO AUTHENTICATION
   Email + Password + Username
   Uses the shared Supabase Cloud system
========================================= */

(() => {
  'use strict';

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
  const forgotButton = $('forgotPassword');

  let mode = 'login';
  let busy = false;
  let client = null;
  let cloud = null;
  let usernameInput = null;

  /* ---------------------------------------
     LOAD SHARED CLOUD SYSTEM
  --------------------------------------- */

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(
        new Error('Could not load ' + src)
      );
      document.head.appendChild(script);
    });
  }

  async function initializeCloud() {
    if (!window.supabase?.createClient) {
      throw new Error('Supabase library could not load.');
    }

    if (!window.ChannelStudioCloud) {
      await loadScript('js/supabase-cloud.js');
    }

    cloud = window.ChannelStudioCloud;

    if (!cloud) {
      throw new Error('Story Studio cloud system is unavailable.');
    }

    if (cloud.ready && typeof cloud.ready.then === 'function') {
      await cloud.ready;
    }

    client = cloud.getClient();

    if (!client) {
      throw new Error('Could not initialize your account connection.');
    }
  }

  /* ---------------------------------------
     CREATE USERNAME FIELD
  --------------------------------------- */

  function createUsernameField() {
    if (usernameInput) return;

    const emailField = emailInput.closest('.field');

    const field = document.createElement('div');
    field.className = 'field';
    field.id = 'usernameField';
    field.hidden = true;

    field.innerHTML = `
      <label class="field-label" for="username">
        Username
      </label>
      <div class="input-wrap">
        <span class="field-icon" aria-hidden="true">@</span>
        <input
          id="username"
          name="username"
          type="text"
          placeholder="Choose your username"
          autocomplete="username"
          minlength="3"
          maxlength="30"
        >
      </div>
    `;

    emailField.parentNode.insertBefore(field, emailField);

    usernameInput = $('username');
  }

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
    const signup = mode === 'signup';

    emailInput.closest('.field').hidden = recovery;
    forgotButton.hidden = mode !== 'login';

    if (usernameInput) {
      $('usernameField').hidden = !signup;
      usernameInput.required = signup;
      usernameInput.value = '';
    }

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
        'Choose your username and create your Story Studio account.';

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

    if (!client) {
      showMessage('Account service is still connecting. Try again.');
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

  async function createAccount(username, email, password) {
    const result = await cloud.signUp(
      username,
      email,
      password
    );

    if (result?.error) {
      throw result.error;
    }

    const {
      data: { session }
    } = await client.auth.getSession();

    if (session) {
      showMessage(
        'Your account is ready. Opening Story Studio…',
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

    if (typeof cloud.refresh === 'function') {
      await cloud.refresh();
    }

    showMessage(
      'Signed in successfully. Welcome back!',
      true
    );

    setTimeout(openHome, 500);
  }

  /* ---------------------------------------
     UPDATE PASSWORD AFTER RECOVERY
  --------------------------------------- */

  async function updatePassword(password) {
    const { error } =
      await client.auth.updateUser({ password });

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

    if (busy || !client) {
      if (!client) {
        showMessage('Account service is connecting. Please try again.');
      }
      return;
    }

    clearMessage();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const username = usernameInput
      ? usernameInput.value.trim()
      : '';

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

    if (mode === 'signup') {
      if (username.length < 3 || username.length > 30) {
        showMessage('Your username must be between 3 and 30 characters.');
        usernameInput.focus();
        return;
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showMessage('Use only letters, numbers and underscores in your username.');
        usernameInput.focus();
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        await signIn(email, password);

      } else if (mode === 'signup') {
        await createAccount(username, email, password);

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
     INITIALIZE
  --------------------------------------- */

  async function initialize() {
    createUsernameField();
    connectSwitchButton();
    updateButtonText();

    try {
      await initializeCloud();

      const {
        data: { session },
        error
      } = await client.auth.getSession();

      if (error) throw error;

      client.auth.onAuthStateChange(event => {
        if (event === 'PASSWORD_RECOVERY') {
          setMode('recovery');
          showMessage(
            'Choose a new password for your account.',
            true
          );
        }
      });

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
      console.error('Story Studio initialization:', error);

      showMessage(
        error.message ||
        'Could not connect to the login service. Check your internet connection and refresh.'
      );
    }
  }

  initialize();

})();
