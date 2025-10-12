// Shared utility functions for cross-server detection
// Used by autoupdate, ddp-client packages and tests
// Updated for PR #13977 fix

// Ensure DDPCommon namespace exists
if (typeof DDPCommon === 'undefined') {
  if (typeof Package !== 'undefined' && Package['ddp-common']) {
    DDPCommon = Package['ddp-common'].DDPCommon;
  } else if (typeof global !== 'undefined') {
    global.DDPCommon = global.DDPCommon || {};
    DDPCommon = global.DDPCommon;
  } else if (typeof window !== 'undefined') {
    window.DDPCommon = window.DDPCommon || {};
    DDPCommon = window.DDPCommon;
  } else {
    // Fallback for testing environments
    DDPCommon = {};
  }
}

// Get the DDP connection URL from runtime config
DDPCommon.getDDPUrl = function() {
  if (typeof __meteor_runtime_config__ !== 'undefined' &&
      __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL) {
    return __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL;
  }
  return null;
};

DDPCommon.isDDPServerDifferent = function() {
  // Server-side always returns false (no cross-server concerns on server)
  if (typeof window === 'undefined') {
    return false;
  }
  
  const ddpUrl = DDPCommon.getDDPUrl();
  if (!ddpUrl || ddpUrl === '/') {
    return false;
  }
  
  const currentOrigin = window.location.origin;
  try {
    const ddpOrigin = new URL(ddpUrl, currentOrigin).origin;
    return ddpOrigin !== currentOrigin;
  } catch (e) {
    return false;
  }
};