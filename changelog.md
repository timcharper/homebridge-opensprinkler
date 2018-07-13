# v0.2.1

- Bring in promise finally shim (fix [#5](https://github.com/timcharper/homebridge-opensprinkler/issues/5))

# v0.2.0

- Clean up logging substantially; no more console.log usage. Polling messages go to debug log.
- If no poll update received for 3x poll duration, show devices as unresponsive when Home queries initial state

# v0.1.2

- Specify NodeJS version dependency. Fixes: (v0.1.1 Promise Error)[https://github.com/timcharper/homebridge-opensprinkler/issues/2]
- Also, Specify Homebridge dependency as 0.4.0 or later.

# v0.1.1

- Fixed issue: (Polling stops working after some time)[https://github.com/timcharper/homebridge-opensprinkler/issues/1].

# v0.1.0

- Time remaining now works, plus the ability to set the default duration per station.
- Queued vs currently watering states properly propagated
- The code is a bit better
- Rain delay config value is removed, favoring the configured value from OpenSprinkler instead.

# v0.0.1

Initial release! It works. Kind of.

