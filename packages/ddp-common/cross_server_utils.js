// Shared utility functions for cross-server detection
// Used by autoupdate, ddp-client packages and tests

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
  
  // Don't interfere with test environments
  if (typeof Meteor !== 'undefined' && Meteor.isTest) {
    return false;
  }
  
  // Don't interfere if we're in a test runner environment
  if (typeof process !== 'undefined' && 
      (process.env.NODE_ENV === 'test' || 
       process.env.TEST_METADATA || 
       process.env.IS_MIRROR)) {
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