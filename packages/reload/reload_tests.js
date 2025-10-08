Tinytest.add("reload - migrate", function (test) {
  Reload._withFreshProvidersForTest(function () {
    // Simulate the state of migration 1
    let readyStateMigration1 = false;
    Reload._onMigrate("reload test data 1", function (tryReload, options) {
      return [readyStateMigration1, { foo: "bar" }];
    });

    Reload._onMigrate("reload test data 2", function (tryReload, options) {
      return [true, { baz: "bar" }];
    });

    // When one provider returns false, no migration data should be stored.
    test.isFalse(Reload._migrate(function () { }));
    test.isFalse(Reload._getData());

    // If an immediate migration is happening, then it shouldn't matter if
    // one provider returns false.
    test.isTrue(Reload._migrate(function () { }, { immediateMigration: true }));
    var data = JSON.parse(Reload._getData());
    test.equal(data.data["reload test data 1"], { foo: "bar" });
    test.equal(data.data["reload test data 2"], { baz: "bar" });
    test.equal(data.reload, true);

    // Now all providers are ready.
    readyStateMigration1 = true;
    test.isTrue(Reload._migrate(function () { }));

    data = JSON.parse(Reload._getData());
    test.equal(data.data["reload test data 1"], { foo: "bar" });
    test.equal(data.data["reload test data 2"], { baz: "bar" });
    test.equal(data.reload, true);
  });
});

Tinytest.add("reload - cross-server DDP migration", function (test) {
  const originalConfig = global.__meteor_runtime_config__;
  const originalWindow = global.window;
  
  try {
    global.__meteor_runtime_config__ = {
      DDP_DEFAULT_CONNECTION_URL: 'http://different-server.com'
    };
    global.window = {
      location: { origin: 'http://localhost:3000' }
    };
    
    Reload._withFreshProvidersForTest(function () {
      Reload._onMigrate("test migration", function (tryReload, options) {
        return [true, { test: "data" }];
      });
      
      test.isFalse(Reload._migrate(function () {}));
      test.isFalse(Reload._getData());
    });
  } finally {
    global.__meteor_runtime_config__ = originalConfig;
    global.window = originalWindow;
  }
});
