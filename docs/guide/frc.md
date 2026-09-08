# FRC

- **Project folder** — `src/main/deploy/brainstemPilotAuto/`. It sits inside `deploy/` so it ships to the roboRIO with your code.
- **Units** — metres, metres per second, and degrees. Coordinates are `frc-bottom-left`: origin at the bottom-left corner of the field.
- **Start side** — each path carries an L or R flag. It does not move waypoints; it tells robot code which side the path was drawn for.
- **Mirroring** — the L/R and Blue/Red toggles preview the opposite side and alliance without changing saved coordinates. Robot code does the real mirroring when it builds the auto.
- **No generated code** — FRC autos are chosen at runtime. Your code enumerates `autos/` and builds by name.

Install the vendordep from [Install the FRC library](/install/frc). Class reference: [FRC Javadoc](/javadoc/frc/).
