# Electronics

The **Electronics** tab works the wheel's electronics out from the build: strips per side, LEDs per strip, spokes, hub and fork. While the tab is open, the main area shows four sheets:

- **Circuit:** the circuit diagram.
- **Wiring:** the wiring and harness colours.
- **Hub module:** the module round the hub, to scale.
- **Board:** the carrier board's layout.

The tab also lists the power budget, warns about anything that doesn't fit, and writes the shopping list as CSV. The code is in `src/electronics/`.

## The platform

| Part | What | Why |
|---|---|---|
| Controller | Adafruit Feather RP2350 with 8 MB PSRAM (6130) | Two cores, PIO, and room for animations in PSRAM. Everything is wired from its headers; its HSTX port isn't used |
| Strips | Adafruit DotStar 144/m, black: one half metre (2328, 72 LEDs) per blade, cut to the blade from the tip in, 38 LEDs on the default wheel. Not the 1 m 2241: it is two halves joined, with a 2–3 mm pitch error at the joint | SK9822: clock and data, so no timing-critical single wire |
| Level shifters | 74AHCT125, four channels each (SOIC on the carrier; the 1787 DIP for a breadboard) | SK9822s at 5 V want a high above 3.5 V; the Feather gives 3.3 V |
| Hall sensors | US5881 (158), one per strip, left panel only | The left panel times both sides; the right panel's sensor ties stay empty |
| Power | Two 18650 high-drain cells in parallel, a 1S protection board, a 10 A fuse, a Pololu U3V70F5 5 V boost (2891) | Simple USB charging, and the boost has a true shutdown |
| Mounting | A 3D-printed bracket tied to the hub shell, a hook-and-loop strap, an XT30 between the pack and the box, a stick-on rim weight | Easy on and off; balanced |
| Charger | bq24074 breakout (4755), 1 A (1.5 A by jumper) | Its CE pin stops charging while the wheel runs |
| On/off | Sealed reed switch (375) and a soft latch | A magnet held to the mark: nothing to seal round a button |
| Buttons | Two sealed 12 mm IP67 momentary pushbuttons in the electronics box's lid: preset and brightness | The wheel's controls, on the hub package |
| Right connector | Weipu SP13 9-pin, IP68: an inline socket on the module's pigtail, a plug on the right panel | Screw-lock, 3 A a contact, and cheap |

The simulator now models only this platform. The other chips and LED types, CircuitPython and the magnetometer are gone. The clock (12 MHz), PWM and overhead values are still editable under Hardware → Controller → details.

## Data: one PIO program on GPIO0–7

One PIO program shifts out eight data lanes on **GPIO0–7**, eight pins in a row that all reach the Feather's headers. It side-sets both clocks in step: GPIO10 for the left side and GPIO11 for the right. Every strip gets its own lane, so a column takes `(38 + 2) × 32` bits at 12 MHz, about 0.1 ms, however many strips there are. Core 1 turns each column into the bit-planes the PIO shifts out.

The header pins come from Adafruit's CircuitPython board definition for the Feather RP2350. The pinout guide's "D4" is a typo there: GPIO4 is the pin labelled **12**.

| Lane | GPIO | Header pin | Strip |
|---|---|---|---|
| L1–L4 | 0–3 | TX, RX, SDA, SCL | left 1–4 |
| R1–R4 | 4–7 | D12, D5, D6, D13 | right 1–4 |
| CLK_L / CLK_R | 10 / 11 | D10 / D11 | left / right clocks |

With 3 strips per side the lanes are GPIO0–2 and GPIO4–6. With shared back data, the right buffers copy the left lanes.

What this costs:

- **UART:** TX and RX carry data, so debug output goes over USB, which the Feather does natively.
- **I2C:** SDA and SCL carry data too, so the STEMMA QT socket can't be used. Nothing in the design needs I2C. If an IMU is added later, move the right side's lanes to another run of four pins and run a second PIO program.
- **Red LED:** GPIO7 is also the Feather's red LED (D13), so it flickers with right strip 4's data. That's harmless.

What it buys: no ribbon cable folded under the Feather, no FPC socket, and every signal on the headers. That makes a FeatherWing Doubler bench build straightforward. Earlier the lanes were on the HSTX port's pins (GPIO12–19). Those were also eight pins in a row driven by one PIO program, but reached only through the ribbon cable.

The rest of the pins:

| Pin | Use |
|---|---|
| D9, MI, SCK, MO | Hall sensors 1–4, one falling-edge interrupt each |
| A0 | Battery voltage, through a 100k/100k divider |
| A1 | Preset button |
| A2 | `LED_EN`: turns on the boost and the right side's 5 V |
| A3 | Brightness button |
| D24 | `HOLD`: keeps the latch on |
| D25 | `SW`: reads the reed switch |

GPIO8 is the PSRAM's chip select and stays free.

## Buttons

The wheel has two buttons, on the hub package. With the reed switch, they sit in the electronics box's lid, on its outer face. The panels' discs cover the box from the sides, so you reach them through the spokes beyond the discs' edge; raised caps help.

- **Preset:** a click goes to the next preset; a double click turns Auto on or off (Auto: the next preset each time the lights go out).
- **Brightness:** each press steps the LEDs to the next of four levels: 100, 50, 25, 12 %, then back to 100. A double click puts the wheel to sleep: the LEDs and the boost go off and the Feather goes dormant, waking on a press of either button (the first press only wakes it). The hall sensors stay powered, about 16 mA, so for storage switch off with the magnet. The firmware scales its LED current limit with it and keeps the level when the wheel is switched off.

Each input has a 10k pull-up to 3.3 V, 1 kΩ in series and 100 nF at the pin, against noise and static in the wet. In the simulator, **Next ▶** and **☀** on the ride bar are these two buttons (keys N and B). Double-click **Next ▶** to toggle **Auto**, and **☀** to sleep.

Each lane and clock goes through a 74AHCT125 powered at 5 V, with a 33 Ω series resistor at each output for the 20–30 cm runs and the connector.

## Power

- **Peak current:** full white on all 304 LEDs would draw 18 A. The firmware scales each column so the strips never draw more than the **LED current limit**, 3.5 A by default. From a 3.6 V cell the boost gives about 4.3 A, at about 6 A from the cells, or 3 A per cell.
- **Runtime:** two 3000 mAh cells last about 0.9 h even pinned at the limit. Most pictures draw far less; see the Stats tab, whose battery figure follows the cells.
- **Boost:** the boost runs straight off the protected, fused cells. `LED_EN` enables it. A 4.7 kΩ pull-down holds it off while the logic is off: the boost's own 100 kΩ pull-up to its input would otherwise turn it on.
- **Off drain:** a few tens of µA through that divider.
- **Logic:** the reed switch and `HOLD` latch only the Feather's supply, through Q1, a small P-MOSFET. Cut the Feather's CHG jumper so only the bq24074 charges.
- **Hall sensors:** the US5881 needs at least 3.5 V, so the sensors run from the battery through a 100 Ω/10 µF filter. Their 10k pull-ups go to 3.3 V. The sensors' ground has its own wire, kept off the strips' return current.
- **Strips idle:** about 1 mA per LED even when dark, so the firmware turns the boost off when the wheel stops.

### Charging through the right connector

Unplug the right panel and plug in the charging lead: a USB-C sink breakout with 5.1 kΩ on CC1/CC2, wired VBUS to pins 1 and 2 and GND to pins 3 and 4 of an SP13 plug. Its 5 V goes up `+5V_R` to the charger's input.

- **Q3:** an AO4407A P-MOSFET with its source on the connector side. Switched off, it keeps the 5 V off the left strips. When running, `LED_EN` turns it on and the boost feeds both sides.
- **Charger:** its CE pin is pulled up by the logic's supply, so it charges only while the wheel is off and never from its own boost.
- **Charge time:** about 7 h at 1 A for two cells, or about 5 h at 1.5 A with the jumper.

### On and off

To turn the wheel on, hold the magnet to the mark:

1. S1 closes and pulls Q1's gate low through D1.
2. The Feather boots and sets `HOLD`, which keeps Q1 on through Q2.

To turn it off, hold the magnet to the mark again:

1. The firmware sees `SW` go low through D2.
2. It waits for the magnet to go, then drops `HOLD`.

The firmware also drops `HOLD` after some minutes stopped.

## Connector J1 (Weipu SP13 9-pin)

| Pin | Net | Use |
|---|---|---|
| 1, 2 | +5V_R | 5 V to the right strips; charging, 5 V in |
| 3, 4 | GND | ground |
| 5 | CLK_R5 | clock to every right strip |
| 6–9 | R1_5–R4_5 | right strip data (spare pins are ground) |

At the limit the right side draws 1.75 A, about 0.9 A per 5 V contact; each contact is rated 3 A. The live side, the module's pigtail, carries the shrouded socket (SP1311/S9). The right panel and the charging lead carry plugs (SP1310/P9). Cap the socket when the right panel is off. Check the pin genders and numbering against the part's drawing before you wire it.

## Hub module

The module is one stack on one side of the hub shell, between the flanges, built so it goes on and comes off easily:

1. **Bracket:** 3D-printed in PETG or ASA. It is a saddle curved to the hub shell, with rails up the sides of the battery pack. It stays on the hub, held by three zip ties round the shell. On a track hub with cut-out flanges, the ties can also go through the flange windows so the bracket can't slide or turn.
2. **Battery pack:** the cells and their protection board in a printed shell. The cells lie across the axle, two side by side along it. A 65 mm cell along the axle wouldn't clear the spoke cones on a typical road hub.
3. **Electronics box:** a printed shell with the power board (boost, charger, fuse, reed switch) and the Feather on its carrier above it. An XT30 joins it to the pack.

A hook-and-loop strap through the bracket's rails holds the pack and the box. To take the electronics off, undo the strap and unplug J1; the left panel comes with them, since it's wired straight on.

Each piece goes in through the spokes on its own, end first, so check the gaps on your wheel. On the defaults:

| Piece | Needs a gap of about |
|---|---|
| Bracket | 46 × 31 mm |
| Battery pack | 41 × 22 mm |
| Electronics box | 29 × 36 mm |

At the stack's outer corner (r 84 mm) there are about 49 mm between the spoke cones; the box needs 29.

## Balance

The module is about 175 g with its centre about 36 mm from the axle. The **Hub module** sheet adds up what is off-centre and works out a rim weight to cancel it:

1. **Module:** fit it opposite the valve.
2. **J1:** tie it on a right spoke on the far side too, about r 70 mm.
3. **Rim weight:** stick the rest on the rim's inner face, centred, opposite the module.

On the defaults that is 10.5 g of stick-on wheel weight in 5 g segments, trimmed to size. The module and the weight are both in the wheel's mid-plane, so this balances the wheel dynamically too. Take the weight off whenever the module is off.

With **one blade per side**, both blades and their strips (about 53 g, estimated) sit on one side of the wheel, one panel each side of the mid-plane, so they balance each other across it. Fit the module opposite them, with the valve on the blades' side and J1 on the module's side. On the default wheel that leaves 9.5 g of rim weight to stick on the module's side. The blade and strip masses are estimates, so weigh them, and check by spinning the wheel in a truing stand.

## Hub measurements

The sheet uses the Electronics tab's hub shell Ø (30 mm by default) and the Panels tab's hub values: flange hole circle Ø44 mm, flanges ±35 mm. These are typical road-hub numbers. The prototype's State Bicycle All-Road wheelset has track hubs with cut-out flanges, which look closer together than ±35 mm. Measure:

- the shell's diameter between the flanges
- the spoke hole circle
- the distance between the flanges' inner faces

The bracket has to fit between the flanges; the tab warns when it doesn't.

## Carrier board

The carrier board is 62 × 22.9 mm, the Feather's outline with a strip of wire pads at each end. The Feather plugs in 8.5 mm above it on female headers, and every signal comes through them: there is no ribbon cable. Under the Feather sit the three SOIC shifters with their 33 Ω resistors, Q1–Q4, D1–D2, and the pull-ups and filters for the hall sensors and buttons.

The harnesses solder straight to the numbered pads: J2 at one end; at the other, the J1 pigtail, the power board's wires, and the lid's reed switch and buttons. The Board sheet is a placement for routing in KiCad, not a routed board. Check the header positions against the Feather.

## Waterproofing

- **Conformal coating:** coat the carrier, the Feather and the power boards.
- **Pack and box:** give the printed shells gasketed lids, with neutral-cure silicone where the wires leave.
- **Strip ends:** the strips' silicone sleeves are weatherproof, but cutting them opens the ends. Cap the cut ends with silicone end caps and neutral-cure RTV. Acetic-cure RTV corrodes copper.
- **Connector:** the SP13 is IP68 when mated, or with its cap on.
- **Buttons:** IP67 pushbuttons, each sealed in the lid with its own O-ring and nut.
- **Firmware updates:** the Feather's USB-C is inside the electronics box. Put a removable boot over it in the box's end, or plan to reopen the box.

## Open questions

- **Pinout check:** check the SP13 9-pin's genders and numbering, and the Feather's header pin positions, against the parts' drawings.
- **Hub measurements:** measure the hub shell diameter, the spoke hole circle, and the gap between the flanges.
- **Spoke gaps:** check that each piece passes through a gap between the spokes.
- **Charger CE:** confirm the bq24074 breakout's CE pad and its default state.
- **Boost:** confirm the U3V70F5 tolerates 5 V on its output while it is disabled, as it is during charging.
