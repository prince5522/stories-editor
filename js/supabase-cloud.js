/* =========================================================
   STORY STUDIO — SUPABASE CLOUD SYSTEM
   Authentication: Email + Password
   Profiles: Unique usernames
   Backup: Owner-scoped episode synchronization
   Storage: Local + Supabase
   ========================================================= */

(function () {
  'use strict';

  const PROJECT_URL =
    'https://fkyihttehxinegibcwws.supabase.co';

  const PUBLISHABLE_KEY =
    'sb_publishable_N54NlBxYHQgpiKr7oy2oRQ_yfe_E1dV';

  const statusEl = () =>
    document.getElementById('cloudStatus');

  function status(message, online) {
    const el = statusEl();

    if (el) {
      el.textContent = message;
      el.dataset.online = online ? 'true' : 'false';
    }
  }

  if (!window.StudioStore) {
    console.error('Story Studio: StudioStore is missing.');
    status('Local storage unavailable', false);
    return;
  }

  const originalSet =
    window.StudioStore.set.bind(window.StudioStore);

  let client = null;
  let ownerId = null;
  let currentUser = null;
  let currentProfile = null;
  let initialized = false;
  let initializationPromise = null;
  let backgroundSyncPromise = null;

  let queue = Promise.resolve();

  /* =========================================================
     UTILITIES
     ========================================================= */

  function errorMessage(error) {
    return String(
      error && error.message
        ? error.message
        : error || 'An unexpected error occurred.'
    );
  }

  function validUsername(username) {
    return /^[a-zA-Z0-9_]{3,20}$/.test(username);
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function normalizeUsername(username) {
    return String(username || '').trim();
  }

  function notifyError(error) {
    window.dispatchEvent(
      new CustomEvent('channelstudio:cloud-error', {
        detail: errorMessage(error)
      })
    );
  }

  /* =========================================================
     EPISODE CLOUD FORMAT
     ========================================================= */

  function toRow(ep) {
    return {
      id: String(ep.id),
      author_id: ownerId,

      story_title: String(
        ep.story_title ||
        ep.storyName ||
        ''
      ).trim(),

      season_number:
        Number(ep.season_number) || 1,

      episode_number:
        Number(ep.episode_number) || 1,

      episode_name:
        String(ep.episode_name || ''),

      episode_subtitle:
        String(ep.episode_subtitle || ''),

      episode_text:
        String(ep.episode_text || ''),

      word_count:
        Number(ep.word_count) || 0,

      reading_time_min:
        Number(ep.reading_time_min) || 0,

      content_rating:
        ep.content_rating === '18+'
          ? '18+'
          : 'general',

      source: 'manual_ready_made',

      scheduled_post_at:
        ep.scheduled_post_at || null,

      reminder_enabled:
        !!ep.reminder_enabled,

      reminder_channel_push:
        ep.reminder_channel
          ? ep.reminder_channel.push !== false
          : true,

      reminder_channel_in_app:
        ep.reminder_channel
          ? ep.reminder_channel.in_app !== false
          : true,

      reminder_channel_whatsapp_sms:
        !!(
          ep.reminder_channel &&
          ep.reminder_channel.whatsapp_sms
        ),

      reminder_type: [
        'one_off',
        'recurring',
        'smart_cadence'
      ].includes(ep.reminder_type)
        ? ep.reminder_type
        : 'one_off',

      status: [
        'draft',
        'scheduled',
        'posted'
      ].includes(ep.status)
        ? ep.status
        : 'draft',

      posted_at:
        ep.posted_at || null,

      author_approved:
        !!ep.author_approved,

      auto_post_enabled: false,

      created_at:
        ep.created_at || new Date().toISOString(),

      updated_at:
        new Date().toISOString()
    };
  }

  function fromRow(row, localEpisode) {
    const local = localEpisode || {};

    return {
      id: row.id,

      story_title: String(
        row.story_title ||
        local.story_title ||
        local.storyName ||
        ''
      ).trim(),

      season_number:
        row.season_number ||
        local.season_number ||
        1,

      episode_number:
        row.episode_number ||
        local.episode_number ||
        1,

      episode_name:
        row.episode_name ||
        local.episode_name ||
        '',

      episode_subtitle:
        row.episode_subtitle ||
        local.episode_subtitle ||
        '',

      episode_text:
        row.episode_text ||
        local.episode_text ||
        '',

      word_count:
        row.word_count ||
        local.word_count ||
        0,

      reading_time_min:
        row.reading_time_min ||
        local.reading_time_min ||
        0,

      content_rating:
        row.content_rating ||
        local.content_rating ||
        'general',

      source: 'manual_ready_made',

      scheduled_post_at:
        row.scheduled_post_at ||
        local.scheduled_post_at ||
        null,

      reminder_enabled:
        row.reminder_enabled !== undefined
          ? !!row.reminder_enabled
          : !!local.reminder_enabled,

      reminder_channel: {
        push: row.reminder_channel_push !== false,
        in_app: row.reminder_channel_in_app !== false,
        whatsapp_sms:
          !!row.reminder_channel_whatsapp_sms
      },

      reminder_type:
        row.reminder_type ||
        local.reminder_type ||
        'one_off',

      status:
        row.status ||
        local.status ||
        'draft',

      posted_at:
        row.posted_at ||
        local.posted_at ||
        null,

      author_approved:
        row.author_approved !== undefined
          ? !!row.author_approved
          : !!local.author_approved,

      auto_post_enabled: false,

      reminder_sent_at:
        local.reminder_sent_at || null,

      created_at:
        row.created_at ||
        local.created_at ||
        new Date().toISOString()
    };
  }

  /* =========================================================
     PROFILE SYSTEM
     ========================================================= */

  async function loadProfile() {
    if (!client || !currentUser) {
      return null;
    }

    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      currentProfile = data;
      return data;
    }

    const username = normalizeUsername(
      currentUser.user_metadata?.username
    );

    if (!validUsername(username)) {
      currentProfile = null;
      return null;
    }

    const { data: created, error: createError } =
      await client
        .from('profiles')
        .insert({
          id: currentUser.id,
          username: username,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

    if (createError) throw createError;

    currentProfile = created;

    return created;
  }

  async function updateUsername(username) {
    try {
      if (!client || !currentUser) {
        throw new Error('Please log in first.');
      }

      username = normalizeUsername(username);

      if (!validUsername(username)) {
        throw new Error(
          'Username must contain 3–20 letters, numbers or underscores.'
        );
      }

      const { data, error } = await client
        .from('profiles')
        .upsert({
          id: currentUser.id,
          username: username,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('Username is already taken.');
        }

        throw error;
      }

      const { error: metadataError } =
        await client.auth.updateUser({
          data: {
            username: username
          }
        });

      if (metadataError) throw metadataError;

      currentProfile = data;

      currentUser.user_metadata = {
        ...currentUser.user_metadata,
        username: username
      };

      window.dispatchEvent(
        new CustomEvent('channelstudio:profile-updated', {
          detail: {
            username: username,
            user: currentUser
          }
        })
      );

      return {
        success: true,
        username: username,
        message: 'Username updated successfully.'
      };

    } catch (error) {
      return {
        success: false,
        error: errorMessage(error)
      };
    }
  }

  function getUsername() {
    return (
      currentProfile?.username ||
      currentUser?.user_metadata?.username ||
      currentUser?.email?.split('@')[0] ||
      'Story Studio User'
    );
  }

  async function getProfile() {
    try {
      if (!currentUser) return null;

      return await loadProfile();

    } catch (error) {
      console.error('Profile loading failed:', error);
      return null;
    }
  }

  /* =========================================================
     EPISODE SYNCHRONIZATION
     ========================================================= */

  async function syncChanges(before, after) {
    if (!initialized || !client || !ownerId) {
      return;
    }

    const oldItems =
      Array.isArray(before) ? before : [];

    const newItems =
      Array.isArray(after) ? after : [];

    const newIds = new Set(
      newItems.map(ep => String(ep.id))
    );

    const removed = oldItems
      .map(ep => String(ep.id))
      .filter(id => !newIds.has(id));

    try {
      if (newItems.length) {
        const { error } = await client
          .from('episodes')
          .upsert(
            newItems.map(toRow),
            { onConflict: 'id' }
          );

        if (error) throw error;
      }

      if (removed.length) {
        const { error } = await client
          .from('episodes')
          .delete()
          .eq('author_id', ownerId)
          .in('id', removed);

        if (error) throw error;
      }

      status('Cloud synced ✓', true);

      window.dispatchEvent(
        new CustomEvent('channelstudio:cloud-synced')
      );

    } catch (error) {
      console.error('Cloud save failed:', error);

      status('Cloud save failed · local copy kept', false);

      notifyError(error);
    }
  }

  // Local storage remains the primary immediate save.
  window.StudioStore.set = function (key, value) {
    const before =
      key === 'readyMadeEpisodes'
        ? window.StudioStore.get(key, [])
        : null;

    const result = originalSet(key, value);

    if (
      key === 'readyMadeEpisodes' &&
      Array.isArray(value)
    ) {
      queue = queue
        .then(() => syncChanges(before, value))
        .catch(error => {
          console.error('Cloud queue failed:', error);
        });
    }

    return result;
  };

  /* =========================================================
     CLOUD RESTORE
     ========================================================= */

  async function loadCloudData(options = {}) {
    if (!client || !ownerId) {
      throw new Error('No authenticated account.');
    }

    const uploadLocalOnly =
      options.uploadLocalOnly !== false;

    const { data, error } = await client
      .from('episodes')
      .select('*')
      .eq('author_id', ownerId)
      .order('season_number')
      .order('episode_number');

    if (error) throw error;

    const local =
      window.StudioStore.get('readyMadeEpisodes', []);

    const localItems =
      Array.isArray(local) ? local : [];

    if (data && data.length) {
      const localById = new Map(
        localItems.map(ep => [String(ep.id), ep])
      );

      const cloudIds = new Set(
        data.map(row => String(row.id))
      );

      const cloudItems = data.map(row =>
        fromRow(
          row,
          localById.get(String(row.id))
        )
      );

      const localOnly = uploadLocalOnly
        ? localItems.filter(
            ep => !cloudIds.has(String(ep.id))
          )
        : [];

      const merged = cloudItems.concat(localOnly);

      originalSet('readyMadeEpisodes', merged);

      if (localOnly.length) {
        const { error: uploadError } = await client
          .from('episodes')
          .upsert(
            localOnly.map(toRow),
            { onConflict: 'id' }
          );

        if (uploadError) throw uploadError;
      }

      const recovered = cloudItems.filter(ep => {
        const original = localById.get(String(ep.id));

        return (
          original &&
          !data.find(
            row => String(row.id) === String(ep.id)
          )?.story_title &&
          !!ep.story_title
        );
      });

      if (recovered.length) {
        const { error: recoveryError } = await client
          .from('episodes')
          .upsert(
            recovered.map(toRow),
            { onConflict: 'id' }
          );

        if (recoveryError) throw recoveryError;
      }

    } else if (localItems.length && uploadLocalOnly) {
      const { error: uploadError } = await client
        .from('episodes')
        .upsert(
          localItems.map(toRow),
          { onConflict: 'id' }
        );

      if (uploadError) throw uploadError;

    } else if (data && !data.length) {
      originalSet('readyMadeEpisodes', []);
    }

    return true;
  }

  /* =========================================================
     ACCOUNT SESSION
     ========================================================= */

  async function refreshAccount(options = {}) {
    if (!client) {
      throw new Error('Cloud client unavailable.');
    }

    const { data, error } =
      await client.auth.getSession();

    if (error) throw error;

    const session = data.session;

    if (!session || !session.user) {
      throw new Error('No active account session.');
    }

    currentUser = session.user;
    ownerId = session.user.id;
    initialized = false;

    await loadProfile();

    await loadCloudData({
      uploadLocalOnly:
        options.uploadLocalOnly !== false
    });

    initialized = true;

    status('Cloud connected ✓', true);

    window.dispatchEvent(
      new CustomEvent('channelstudio:cloud-ready', {
        detail: {
          user: currentUser,
          username: getUsername()
        }
      })
    );

    return {
      success: true,
      user: currentUser,
      profile: currentProfile,
      username: getUsername(),
      userId: ownerId
    };
  }

  /* =========================================================
     REGISTER ACCOUNT
     ========================================================= */

  async function signUp(username, email, password) {
    try {
      if (!client) {
        throw new Error('Cloud client unavailable.');
      }

      username = normalizeUsername(username);
      email = normalizeEmail(email);

      if (!validUsername(username)) {
        throw new Error(
          'Username must be 3–20 characters using letters, numbers or underscores.'
        );
      }

      if (!email || !password) {
        throw new Error(
          'Email and password are required.'
        );
      }

      if (password.length < 8) {
        throw new Error(
          'Password must contain at least 8 characters.'
        );
      }

      const { data: sessionData, error: sessionError } =
        await client.auth.getSession();

      if (sessionError) throw sessionError;

      const current = sessionData.session?.user;

      let result;

      if (current && current.is_anonymous) {
        result = await client.auth.updateUser({
          email: email,
          password: password,
          data: {
            username: username
          }
        });

      } else {
        result = await client.auth.signUp({
          email: email,
          password: password,
          options: {
            data: {
              username: username
            }
          }
        });
      }

      if (result.error) throw result.error;

      const { data: latest, error: latestError } =
        await client.auth.getSession();

      if (latestError) throw latestError;

      if (latest.session) {
        currentUser = latest.session.user;
        ownerId = currentUser.id;

        const { error: profileError } = await client
          .from('profiles')
          .upsert({
            id: ownerId,
            username: username,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'id'
          });

        if (profileError) {
          if (profileError.code === '23505') {
            throw new Error('That username is already taken.');
          }

          throw profileError;
        }

        await refreshAccount();
      }

      return {
        success: true,
        username: username,
        message: latest.session
          ? 'Account created successfully.'
          : 'Check your email to confirm your account.',
        confirmationRequired: !latest.session,
        user: result.data.user
      };

    } catch (error) {
      return {
        success: false,
        error: errorMessage(error)
      };
    }
  }

  /* =========================================================
     LOGIN
     ========================================================= */

  async function signIn(email, password) {
    try {
      if (!client) {
        throw new Error('Cloud client unavailable.');
      }

      email = normalizeEmail(email);

      if (!email || !password) {
        throw new Error(
          'Email and password are required.'
        );
      }

      await queue;

      const { error } =
        await client.auth.signInWithPassword({
          email: email,
          password: password
        });

      if (error) throw error;

      const account = await refreshAccount({
        uploadLocalOnly: false
      });

      return {
        success: true,
        message: 'Welcome back, ' + account.username + '!',
        user: account.user,
        username: account.username
      };

    } catch (error) {
      return {
        success: false,
        error: errorMessage(error)
      };
    }
  }

  /* =========================================================
     PASSWORD RECOVERY
     ========================================================= */

  async function resetPassword(email) {
    try {
      if (!client) {
        throw new Error('Cloud client unavailable.');
      }

      email = normalizeEmail(email);

      if (!email) {
        throw new Error('Enter your email address.');
      }

      const { error } =
        await client.auth.resetPasswordForEmail(email, {
          redirectTo:
            window.location.origin +
            window.location.pathname
        });

      if (error) throw error;

      return {
        success: true,
        message: 'Password recovery email sent.'
      };

    } catch (error) {
      return {
        success: false,
        error: errorMessage(error)
      };
    }
  }

  /* =========================================================
     CHANGE PASSWORD
     ========================================================= */

  async function changePassword(password) {
    try {
      if (!client || !currentUser) {
        throw new Error('Please log in first.');
      }

      if (!password || password.length < 8) {
        throw new Error(
          'Password must contain at least 8 characters.'
        );
      }

      const { error } = await client.auth.updateUser({
        password: password
      });

      if (error) throw error;

      return {
        success: true,
        message: 'Password changed successfully.'
      };

    } catch (error) {
      return {
        success: false,
        error: errorMessage(error)
      };
    }
  }

  /* =========================================================
     LOGOUT
     ========================================================= */

  async function signOut() {
    try {
      if (!client) {
        throw new Error('Cloud client unavailable.');
      }

      await queue;

      const { error } = await client.auth.signOut();

      if (error) throw error;

      initialized = false;
      ownerId = null;
      currentUser = null;
      currentProfile = null;

      status('Signed out · local copy kept', false);

      window.dispatchEvent(
        new CustomEvent('channelstudio:logged-out')
      );

      return {
        success: true,
        message: 'Signed out successfully.'
      };

    } catch (error) {
      return {
        success: false,
        error: errorMessage(error)
      };
    }
  }

  /* =========================================================
     FAST INITIALIZATION
     Authentication is established first.
     Profile and episode sync happen in the background.
     ========================================================= */

  async function init() {
    if (initializationPromise) {
      return initializationPromise;
    }

    initializationPromise = (async function () {
      status('Connecting to Supabase…', false);

      if (
        !window.supabase ||
        !window.supabase.createClient
      ) {
        status('Cloud unavailable · local mode', false);

        return {
          online: false,
          error: 'Supabase library is unavailable.'
        };
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

        const { data, error } =
          await client.auth.getSession();

        if (error) throw error;

        let session = data.session;

        // Create a guest session only when no session exists.
        if (!session) {
          const guest =
            await client.auth.signInAnonymously();

          if (guest.error) throw guest.error;

          session = guest.data.session;
        }

        if (!session || !session.user) {
          throw new Error(
            'Supabase did not return an active session.'
          );
        }

        // Make account identity available immediately.
        currentUser = session.user;
        ownerId = session.user.id;
        currentProfile = null;
        initialized = false;

        status('Account connected · syncing cloud data…', true);

        // Start database work without blocking the login page.
        backgroundSyncPromise = Promise.resolve()
          .then(() => refreshAccount())
          .catch(error => {
            console.error(
              'Background cloud synchronization failed:',
              error
            );

            initialized = false;

            status(
              'Account connected · cloud sync needs attention',
              false
            );

            notifyError(error);

            return {
              success: false,
              error: errorMessage(error)
            };
          });

        return {
          online: true,
          authenticated: true,
          userId: ownerId,
          username: getUsername(),
          user: currentUser,
          syncing: true
        };

      } catch (error) {
        console.error(
          'Story Studio cloud initialization failed:',
          error
        );

        initialized = false;

        status(
          'Cloud setup needed · local copy kept',
          false
        );

        notifyError(error);

        return {
          online: false,
          error: errorMessage(error)
        };
      }
    })();

    return initializationPromise;
  }

  /* =========================================================
     PUBLIC API
     ========================================================= */

  window.ChannelStudioCloud = {
    ready: null,

    getClient: () => client,

    getUser: async () => {
      if (!client) return null;

      const { data, error } =
        await client.auth.getUser();

      if (error) return null;

      currentUser = data.user;

      if (currentUser) {
        ownerId = currentUser.id;
      }

      return currentUser;
    },

    getUserId: () => ownerId,

    getUsername: getUsername,

    getProfile: getProfile,

    updateUsername: updateUsername,

    signUp: signUp,

    signIn: signIn,

    signOut: signOut,

    resetPassword: resetPassword,

    changePassword: changePassword,

    refresh: refreshAccount,

    waitForCloudSync: async () => {
      if (backgroundSyncPromise) {
        return await backgroundSyncPromise;
      }

      return {
        success: initialized
      };
    },

    isConnected: () => initialized,

    isLoggedIn: () =>
      !!currentUser && !currentUser.is_anonymous
  };

  // Start once and expose the same promise to every page script.
  window.ChannelStudioCloud.ready = init();

})();
