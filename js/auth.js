
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
  const togglePassword = $('togglePassword');

  let mode = 'login';
  let busy = false;
  let client = null;
  let cloud = null;
  let usernameInput = null;
  let authListener = null;
   function rememberOfflineAccess(username) {
    try {
      localStorage.setItem('channelStudio.authenticated', '1');

      if (username) {
        localStorage.setItem('channelStudio.username', username);
      }
    } catch (error) {
      console.warn('Could not save offline access:', error);
    }
  }

  /* ---------------------------------------
     CHECK REQUIRED HTML ELEMENTS
  --------------------------------------- */

  function validatePage() {
    const required = {
      loginForm: form,
      email: emailInput,
      password: passwordInput,
      submitButton: submitButton,
      runway: runway,
      loginMessage: message,
      formHeading: formHeading,
      formDescription: formDescription,
      accountSwitch: accountSwitch,
      forgotPassword: forgotButton,
      togglePassword: togglePassword
    };

    const missing = Object.keys(required)
      .filter(id => !required[id]);

    if (missing.length) {
      throw new Error(
        'Login page is missing these elements: ' +
        missing.join(', ')
      );
    }
  }

  /* ---------------------------------------
     SCRIPT LOADER
  --------------------------------------- */

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(
        document.scripts
      ).find(script => script.src === new URL(
        src,
        window.location.href
      ).href);

      if (existing && existing.dataset.loaded === 'true') {
        resolve();
        return;
      }

      const script = existing || document.createElement('script');

      if (!existing) {
        script.src = src;
        script.async = true;
        document.head.appendChild(script);
      }

      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });

      script.addEventListener('error', () => {
        reject(new Error('Could not load ' + src));
      }, { once: true });

      if (
        existing &&
        window.StudioStore &&
        window.supabase?.createClient &&
        window.ChannelStudioCloud
      ) {
        resolve();
      }
    });
  }

  /* ---------------------------------------
     LOAD SHARED CLOUD SYSTEM
  --------------------------------------- */

  async function initializeCloud() {
    // 1. Ensure local storage is available.
    if (!window.StudioStore) {
      await loadScript('js/storage.js');
    }

    if (!window.StudioStore) {
      throw new Error(
        'Local storage could not initialize.'
      );
    }

    // 2. Ensure Supabase library is available.
    if (!window.supabase?.createClient) {
      await loadScript(
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
      );
    }

    if (!window.supabase?.createClient) {
      throw new Error(
        'Supabase library could not load.'
      );
    }

    // 3. Load the shared cloud system.
    if (!window.ChannelStudioCloud) {
      await loadScript('js/supabase-cloud.js');
    }

    cloud = window.ChannelStudioCloud;

    if (!cloud) {
      throw new Error(
        'Story Studio cloud system is unavailable.'
      );
    }

    // 4. IMPORTANT:
    // Wait for cloud initialization BEFORE getting its client.
    if (
      cloud.ready &&
      typeof cloud.ready.then === 'function'
    ) {
      const result = await cloud.ready;

      if (result?.online === false) {
        throw new Error(
          result.error ||
          'Could not connect to the account service.'
        );
      }
    }

    // 5. Now the client should be available.
    client = cloud.getClient();

    if (!client) {
      throw new Error(
        'Could not initialize your account connection.'
      );
    }

    return client;
  }

  /* ---------------------------------------
     CREATE USERNAME FIELD
  --------------------------------------- */

  function createUsernameField() {
    if (usernameInput) return;

    const emailField = emailInput.closest('.field');

    if (!emailField || !emailField.parentNode) {
      throw new Error(
        'Could not locate the email input field.'
      );
    }

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
          maxlength="20"
          pattern="[a-zA-Z0-9_]+"
        >
      </div>
    `;

    emailField.parentNode.insertBefore(
      field,
      emailField
    );

    usernameInput = $('username');
  }

  /* ---------------------------------------
     MESSAGES
  --------------------------------------- */

  function showMessage(text, success = false) {
    message.textContent = text;

    message.className =
      'login-message' +
      (success ? ' success' : '');

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

    runway.classList.toggle(
      'loading',
      loading
    );

    if (loading) {
      submitButton.textContent =
        text || 'Please wait…';
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
    if (
      !['login', 'signup', 'recovery'].includes(nextMode)
    ) {
      return;
    }

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

      passwordInput.placeholder =
        'At least 8 characters';

      passwordInput.autocomplete = 'new-password';

      accountSwitch.hidden = false;

      accountSwitch.innerHTML =
        'Already have an account? <button id="switchMode" type="button">Sign in</button>';

    } else {
      formHeading.textContent = 'New password';

      formDescription.textContent =
        'Choose a new password for your Story Studio account.';

      passwordInput.placeholder =
        'Enter your new password';

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
      setMode(
        mode === 'login'
          ? 'signup'
          : 'login'
      );
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

  togglePassword.addEventListener('click', () => {
    const visible =
      passwordInput.type === 'text';

    passwordInput.type =
      visible ? 'password' : 'text';

    togglePassword.textContent =
      visible ? '◉' : '◎';

    togglePassword.setAttribute(
      'aria-label',
      visible ? 'Show password' : 'Hide password'
    );
  });

  /* ---------------------------------------
     PASSWORD RECOVERY
  --------------------------------------- */

  forgotButton.addEventListener(
    'click',
    async () => {
      if (busy) return;

      clearMessage();

      const email = emailInput.value.trim();

      if (
        !email ||
        !emailInput.checkValidity()
      ) {
        showMessage(
          'Enter your account email first.'
        );

        emailInput.focus();
        return;
      }

      if (!client) {
        showMessage(
          'Account service is unavailable. Refresh the page.'
        );

        return;
      }

      setLoading(true, 'Sending link…');

      try {
        const result = await cloud.resetPassword(email);

        if (!result?.success) {
          throw new Error(
            result?.error ||
            'Could not send the reset email.'
          );
        }

        showMessage(
          'If this email belongs to an account, a password reset link has been sent. Check your inbox.',
          true
        );

      } catch (error) {
        showMessage(
          error.message ||
          'Could not send the reset email.'
        );

      } finally {
        setLoading(false);
      }
    }
  );

  /* ---------------------------------------
     ACCOUNT CREATION
  --------------------------------------- */

  async function createAccount(
    username,
    email,
    password
  ) {
    const result = await cloud.signUp(
      username,
      email,
      password
    );

    if (!result || result.success !== true) {
      throw new Error(
        result?.error ||
        'Account creation failed. Please try again.'
      );
    }

    const {
      data: { session },
      error
    } = await client.auth.getSession();
    if (error) throw error;

    if (
      session?.user &&
      !session.user.is_anonymous
    ) {
      rememberOfflineAccess(username);

      showMessage(
        'Your account is ready. Opening Story Studio…',
        true
      );

      window.setTimeout(openHome, 700);

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
    const result = await cloud.signIn(
      email,
      password
    );

   if (!result || result.success !== true) {
      throw new Error(
        result?.error ||
        'Sign in failed. Please try again.'
      );
    }

    rememberOfflineAccess(email.split('@')[0]);

    showMessage(
      'Signed in successfully. Welcome back!',
      true
    );

    window.setTimeout(openHome, 500);
  }

  /* ---------------------------------------
     UPDATE PASSWORD AFTER RECOVERY
  --------------------------------------- */

  async function updatePassword(password) {
    const result = await cloud.changePassword(password);

    if (!result?.success) {
      throw new Error(
        result?.error ||
        'Could not update your password.'
      );
    }

    showMessage(
      'Password updated successfully. Opening Story Studio…',
      true
    );

    window.setTimeout(openHome, 700);
  }

  /* ---------------------------------------
     FORM SUBMISSION
  --------------------------------------- */

  form.addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      if (busy) return;

      if (!client || !cloud) {
        showMessage(
          'Account service is unavailable. Please refresh the page.'
        );

        return;
      }

      clearMessage();

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      const username = usernameInput
        ? usernameInput.value.trim()
        : '';

      if (mode !== 'recovery') {
        if (
          !email ||
          !emailInput.checkValidity()
        ) {
          showMessage(
            'Enter a valid email address.'
          );

          emailInput.focus();
          return;
        }
      }

      if (
        !password ||
        password.length < 8
      ) {
        showMessage(
          'Your password must contain at least 8 characters.'
        );

        passwordInput.focus();
        return;
      }

      if (mode === 'signup') {
        if (
          username.length < 3 ||
          username.length > 20
        ) {
          showMessage(
            'Your username must be between 3 and 20 characters.'
          );

          usernameInput.focus();
          return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
          showMessage(
            'Use only letters, numbers and underscores in your username.'
          );

          usernameInput.focus();
          return;
        }
      }

      setLoading(true);

      try {
        if (mode === 'login') {
          await signIn(email, password);

        } else if (mode === 'signup') {
          await createAccount(
            username,
            email,
            password
          );

        } else if (mode === 'recovery') {
          await updatePassword(password);
        }

      } catch (error) {
        console.error(
          'Story Studio authentication:',
          error
        );

        showMessage(
          error.message ||
          'Something went wrong. Please try again.'
        );

      } finally {
        setLoading(false);
      }
    }
  );

  /* ---------------------------------------
     INITIALIZE AUTHENTICATION
  --------------------------------------- */

  async function initialize() {
    try {
      validatePage();

      createUsernameField();

      connectSwitchButton();

      updateButtonText();

      setLoading(true, 'Connecting…');

      // Wait until the shared cloud system is ready.
      await initializeCloud();

      const {
        data: { session },
        error
      } = await client.auth.getSession();

      if (error) throw error;

      // Listen for password recovery events.
      const listenerResult =
        client.auth.onAuthStateChange(event => {
          if (event === 'PASSWORD_RECOVERY') {
            setMode('recovery');

            showMessage(
              'Choose a new password for your account.',
              true
            );
          }
        });


      authListener =
        listenerResult?.data?.subscription || null;

      // Existing registered account.
      if (
        session?.user &&
        !session.user.is_anonymous &&
        !window.location.search.includes('type=recovery')
      ) {
         rememberOfflineAccess(
          session.user.user_metadata?.username ||
          session.user.email?.split('@')[0] ||
          'Creator'
        );
        openHome();
        return;
      }

      // Password reset link.
      if (
        window.location.search.includes('type=recovery')
      ) {
        setMode('recovery');

        showMessage(
          'Choose a new password for your account.',
          true
        );
      }

      setLoading(false);

    } catch (error) {
      console.error(
        'Story Studio initialization:',
        error
      );

      setLoading(false);

      showMessage(
        error.message ||
        'Could not connect to the login service. Check your internet connection and refresh.'
      );
    }
  }

  /* ---------------------------------------
     START
  --------------------------------------- */

  initialize();

  // Clean up the authentication listener if the page exits.
  window.addEventListener('pagehide', () => {
    if (authListener) {
      authListener.unsubscribe();
      authListener = null;
    }
  });

})();
