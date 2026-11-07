
/* Story Studio Cloud Sync
   Supabase Auth: anonymous guest upgrade + email/password accounts.
   Preserves existing owner identity when upgrading a guest account.
   Public publishable key only. Never use service_role here.
*/

(function () {
  'use strict';

  const PROJECT_URL = 'https://fkyihttehxinegibcwws.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_N54NlBxYHQgpiKr7oy2oRQ_yfe_E1dV';

  const statusEl = () => document.getElementById('cloudStatus');

  function status(message, online) {
    const el = statusEl();
    if (el) {
      el.textContent = message;
      el.dataset.online = online ? 'true' : 'false';
    }
  }

  const originalSet = window.StudioStore.set.bind(window.StudioStore);

  let client = null;
  let ownerId = null;
  let initialized = false;
  let queue = Promise.resolve();

  function toRow(ep) {
    return {
      id: String(ep.id),
      author_id: ownerId,

      story_title: String(
        ep.story_title || ep.storyName || ''
      ).trim(),

      season_number: Number(ep.season_number) || 1,
      episode_number: Number(ep.episode_number) || 1,

      episode_name: String(ep.episode_name || ''),
      episode_subtitle: String(ep.episode_subtitle || ''),
      episode_text: String(ep.episode_text || ''),

      word_count: Number(ep.word_count) || 0,
      reading_time_min: Number(ep.reading_time_min) || 0,

      content_rating: ep.content_rating === '18+'
        ? '18+'
        : 'general',

      source: 'manual_ready_made',

      scheduled_post_at: ep.scheduled_post_at || null,
      reminder_enabled: !!ep.reminder_enabled,

      reminder_channel_push: ep.reminder_channel
        ? ep.reminder_channel.push !== false
        : true,

      reminder_channel_in_app: ep.reminder_channel
        ? ep.reminder_channel.in_app !== false
        : true,

      reminder_channel_whatsapp_sms: !!(
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

      status: ['draft', 'scheduled', 'posted'].includes(ep.status)
        ? ep.status
        : 'draft',

      posted_at: ep.posted_at || null,
      author_approved: !!ep.author_approved,
      auto_post_enabled: false,

      created_at: ep.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
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

      season_number: row.season_number || local.season_number || 1,
      episode_number: row.episode_number || local.episode_number || 1,

      episode_name: row.episode_name || local.episode_name || '',
      episode_subtitle: row.episode_subtitle || local.episode_subtitle || '',
      episode_text: row.episode_text || local.episode_text || '',

      word_count: row.word_count || local.word_count || 0,
      reading_time_min: row.reading_time_min || local.reading_time_min || 0,

      content_rating: row.content_rating || local.content_rating || 'general',
      source: 'manual_ready_made',

      scheduled_post_at:
        row.scheduled_post_at || local.scheduled_post_at || null,

      reminder_enabled:
        row.reminder_enabled !== undefined
          ? !!row.reminder_enabled
          : !!local.reminder_enabled,

      reminder_channel: {
        push: row.reminder_channel_push !== false,
        in_app: row.reminder_channel_in_app !== false,
        whatsapp_sms: !!row.reminder_channel_whatsapp_sms
      },

      reminder_type: row.reminder_type || local.reminder_type || 'one_off',
      status: row.status || local.status || 'draft',

      posted_at: row.posted_at || local.posted_at || null,

      author_approved:
        row.author_approved !== undefined
          ? !!row.author_approved
          : !!local.author_approved,

      auto_post_enabled: false,
      reminder_sent_at: local.reminder_sent_at || null,

      created_at:
        row.created_at ||
        local.created_at ||
        new Date().toISOString()
    };
  }

  async function syncChanges(before, after) {
    if (!initialized || !client || !ownerId) return;

    const oldItems = Array.isArray(before) ? before : [];
    const newItems = Array.isArray(after) ? after : [];

    const newIds = new Set(newItems.map(ep => String(ep.id)));

    const removed = oldItems
      .map(ep => String(ep.id))
      .filter(id => !newIds.has(id));

    try {
      if (newItems.length) {
        const { error } = await client
          .from('episodes')
          .upsert(newItems.map(toRow), { onConflict: 'id' });

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

    } catch (error) {
      console.error('Cloud save failed:', error);

      status('Cloud save failed · local copy kept', false);

      window.dispatchEvent(
        new CustomEvent('channelstudio:cloud-error', {
          detail: String(error.message || error)
        })
      );
    }
  }

  // Automatically back up Ready-Made Episodes.
  window.StudioStore.set = function (key, value) {
    const before = key === 'readyMadeEpisodes'
      ? window.StudioStore.get(key, [])
      : null;

    const result = originalSet(key, value);

    if (key === 'readyMadeEpisodes' && Array.isArray(value)) {
      queue = queue.then(() => syncChanges(before, value));
    }

    return result;
  };

  // Download and merge cloud episodes with local episodes.
  async function loadCloudData() {
    if (!client || !ownerId) {
      throw new Error('No authenticated account.');
    }

    const { data, error } = await client
      .from('episodes')
      .select('*')
      .eq('author_id', ownerId)
      .order('season_number')
      .order('episode_number');

    if (error) throw error;

    const local = window.StudioStore.get('readyMadeEpisodes', []);
    const localItems = Array.isArray(local) ? local : [];

    if (data && data.length) {
      const localById = new Map(
        localItems.map(ep => [String(ep.id), ep])
      );

      const cloudIds = new Set(
        data.map(row => String(row.id))
      );

      const cloudItems = data.map(row =>
        fromRow(row, localById.get(String(row.id)))
      );

      const localOnly = localItems.filter(
        ep => !cloudIds.has(String(ep.id))
      );

      const merged = cloudItems.concat(localOnly);

      originalSet('readyMadeEpisodes', merged);

      if (localOnly.length) {
        const { error: uploadError } = await client
          .from('episodes')
          .upsert(localOnly.map(toRow), { onConflict: 'id' });

        if (uploadError) throw uploadError;
      }

      // Restore locally saved folder names.
      const recovered = cloudItems.filter(ep => {
        const original = localById.get(String(ep.id));

        return original &&
          !data.find(row => String(row.id) === String(ep.id))?.story_title &&
          !!ep.story_title;
      });

      if (recovered.length) {
        const { error: recoveryError } = await client
          .from('episodes')
          .upsert(recovered.map(toRow), { onConflict: 'id' });

        if (recoveryError) throw recoveryError;
      }

    } else if (localItems.length) {
      const { error: uploadError } = await client
        .from('episodes')
        .upsert(localItems.map(toRow), { onConflict: 'id' });

      if (uploadError) throw uploadError;
    }

    return true;
  }

  function accountError(error) {
    return String(
      error && (error.message || error)
        ? error.message || error
        : 'An unexpected account error occurred.'
    );
  }

  // Refresh account identity and restore its cloud library.
  async function refreshAccount() {
    const { data, error } = await client.auth.getSession();

    if (error) throw error;

    const session = data.session;

    if (!session || !session.user) {
      throw new Error('No active account session.');
    }

    ownerId = session.user.id;

    initialized = false;

    await loadCloudData();

    initialized = true;

    status('Cloud connected ✓', true);

    window.dispatchEvent(
      new CustomEvent('channelstudio:cloud-ready')
    );

    return {
      success: true,
      user: session.user,
      userId: ownerId
    };
  }

  // REGISTER: upgrade the current guest account whenever possible.
  async function signUp(email, password) {
    try {
      if (!client) throw new Error('Cloud client unavailable.');

      email = String(email || '').trim().toLowerCase();

      if (!email || !password) {
        throw new Error('Email and password are required.');
      }

      if (password.length < 8) {
        throw new Error('Password must contain at least 8 characters.');
      }

      const { data: sessionData, error: sessionError } =
        await client.auth.getSession();

      if (sessionError) throw sessionError;

      const currentUser = sessionData.session?.user;

      let result;

      if (currentUser && currentUser.is_anonymous) {
        // Important: preserves the existing guest account ID
        // and its cloud-owned stories during account upgrade.
        result = await client.auth.updateUser({
          email,
          password
        });

      } else {
        result = await client.auth.signUp({
          email,
          password
        });
      }

      if (result.error) throw result.error;

      const { data: latest, error: latestError } =
        await client.auth.getSession();

      if (latestError) throw latestError;

      if (latest.session) {
        await refreshAccount();
      }

      return {
        success: true,
        message: latest.session
          ? 'Account created successfully.'
          : 'Check your email to confirm your account.',
        confirmationRequired: !latest.session,
        user: result.data.user
      };

    } catch (error) {
      return {
        success: false,
        error: accountError(error)
      };
    }
  }

  // LOGIN: access an existing account on another phone.
  async function signIn(email, password) {
    try {
      if (!client) throw new Error('Cloud client unavailable.');

      email = String(email || '').trim().toLowerCase();

      if (!email || !password) {
        throw new Error('Email and password are required.');
      }

      await queue;

      const { error } = await client.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      const account = await refreshAccount();

      return {
        success: true,
        message: 'Welcome back! Your cloud library is restored.',
        user: account.user
      };

    } catch (error) {
      return {
        success: false,
        error: accountError(error)
      };
    }
  }

  // PASSWORD RECOVERY.
  async function resetPassword(email) {
    try {
      if (!client) throw new Error('Cloud client unavailable.');

      email = String(email || '').trim().toLowerCase();

      if (!email) throw new Error('Enter your email address.');

      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin +
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
        error: accountError(error)
      };
    }
  }

  // LOGOUT.
  async function signOut() {
    try {
      if (!client) throw new Error('Cloud client unavailable.');

      await queue;

      const { error } = await client.auth.signOut();

      if (error) throw error;

      initialized = false;
      ownerId = null;

      status('Signed out · local copy kept', false);

      return {
        success: true,
        message: 'Signed out successfully.'
      };

    } catch (error) {
      return {
        success: false,
        error: accountError(error)
      };
    }
  }

  async function init() {
    status('Connecting to Supabase…', false);

    if (!window.supabase || !window.supabase.createClient) {
      status('Cloud unavailable · local mode', false);
      return { online: false };
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

      let { data, error } = await client.auth.getSession();

      if (error) throw error;

      // Keep guest mode available for first-time users.
      if (!data.session) {
        const guest = await client.auth.signInAnonymously();

        if (guest.error) throw guest.error;
      }

      const account = await refreshAccount();

      return {
        online: true,
        userId: account.userId,
        user: account.user
      };

    } catch (error) {
      console.error('Story Studio cloud setup failed:', error);

      initialized = false;

      status('Cloud setup needed · local copy kept', false);

      window.dispatchEvent(
        new CustomEvent('channelstudio:cloud-error', {
          detail: accountError(error)
        })
      );

      return {
        online: false,
        error: accountError(error)
      };
    }
  }

  // Public account and cloud API.
  window.ChannelStudioCloud = {
    ready: init(),

    getClient: () => client,

    getUser: async () => {
      if (!client) return null;

      const { data } = await client.auth.getUser();

      return data.user || null;
    },

    getUserId: () => ownerId,

    signUp,
    signIn,
    signOut,
    resetPassword,

    refresh: refreshAccount,

    isConnected: () => initialized
  };

})();
