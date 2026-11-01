# Tutorial: from your wheel to a cut file and a shopping list

This walks through the basic workflow, start to finish: describe your wheel, choose what it shows, see it
the way people on the street will, then download the panel cut files and the shopping list, and save the
lot. It takes about 15 minutes. Use the [live demo](https://adamburr.github.io/pov-wheel-sim/), or run the app
yourself (`npm install`, then `npm run dev`).

Nothing here needs to be done in order, and nothing is lost if you wander: the app saves your setup in the
browser as you go. In the app, **? Tour** (beside **⚙️ Settings**) is a shorter version of this that points at
each part as it goes.

> **Pre-alpha, untested.** Nothing the app designs has been built and tested yet. Check every part,
> dimension and wire before you build: step 5's 1:1 printout is the cheapest check there is.

## 1. Look around

The page opens on the ride. The big view follows the bike and shows what the human eye sees. The narrow
strip above it watches the bike ride past like a phone camera at night (1/8 s).

The bar at the bottom is the wheel's own controls, plus the bike:

- **Next ▶** is the wheel's preset button: the next look (or press **N**).
- **☀** is the brightness button: 100, 50, 25 and 12 % (or press **B**). A double-click switches the
  wheel off, and on again.
- The **speed** and its slider.
- **Auto** rides stop-and-go through town and steps to the next preset at each stop, when the lights go
  out. Untick it to ride steadily at the slider's speed.

**⚙️ Settings** opens the settings panel: on the right on a computer, from the bottom on a phone. Its
tabs are what the rest of this tutorial uses.

## 2. Describe your wheel (Hardware)

Open **⚙️ Settings → Hardware**.

1. **Strips per side** is at the top: 1 to 4 LED strips on each side of the wheel (3 by default). More
   strips give a brighter, steadier picture; fewer are lighter and cheaper. The panels are easiest to tie
   on when the strip count divides the spoke count (on 32 spokes: 2 or 4, and 3 works too).
2. **Wheel → Size** picks your wheel: 700c, 29", 27.5", 26", 24", 20", 16" or 12". It brings typical
   values for the rest of the wheel, so you can stop here for a first look.
3. To build, measure your wheel and type the numbers into **Rim** (rim size, tire, rim depth, spokes and
   how they are laced), **Hub** (its type and dimensions) and **Fork**. The panels are cut to fit these,
   so they matter: [Before you order](panels.md#before-you-order) lists what to measure and why.
4. **LEDs** holds where the strips sit. Leave *Tip radius* at 0 (automatic: just inside the spoke
   nipples) unless you have measured where the blade tips should end.

Leave **Controller** alone for now: it holds the firmware's settings.

## 3. Choose what it shows (Presets)

Open **Presets**. The list at the top is what the wheel's preset button steps through. Click one to
select it; **↑ / ↓** reorder it; **＋ New preset** copies the selected one; **Delete** removes it.

The selected preset's settings are below the list:

- **Show** picks a pattern (a smiley, a clock face, text, water, a bouncing smiley, a tumble dryer…) or
  *Image / video*.
- For your own picture, choose **📂 Choose image / GIF / video…**, or just drop or paste a file anywhere on
  the page. Under **Picture details**, *Zoom* and *Move right* / *Move up* keep a face clear of the hub.
- **Mode** is *Turns with wheel* (the picture is on the wheel) or *Banner on the road* (the picture stays
  put in the air and the bike paints it as it rides past).
- **Brightness** sets this look's brightness; the ☀ button scales every look on top of it.

## 4. See it the way people will

The main view is the human eye, so at riding speed you see the picture break into sectors and flicker,
as a passer-by would. To see what a photo would catch, open **Simulator → Camera**, set *Seen by* to
*Camera* and pick a *Shutter*: around 1/4 s or longer shows the whole picture. Change the speed with the
slider at the bottom.

**Stats** shows the numbers behind it (rpm, how fast the columns go out, the picture's resolution, the
current draw and the battery life), with a warning for anything that won't work, such as a picture too
big for the controller's memory.

## 5. Get the panels cut (Panels)

Open **Panels**. Two flat panels of 0.8 mm polypropylene hold the strips: one on each side of the wheel,
lying on the spokes and zip-tied to them. The main area shows the part as it sits on your wheel, over
every spoke. *Left* / *Right* switches panel; drag to pan, scroll to zoom, **Fit** (or **F**) to see it
all, and **📏 Measure** (or **M**) to measure between two points.

1. Read the result beside the drawing: the part's size and mass, and a warning for any check that fails
   (the fork, the valve, the nipples). Fix those in **Hardware** first.
2. Go through [Before you order](panels.md#before-you-order).
3. Download **Reference DXF (mm)**, print it at 1:1 and lay it on the wheel. It's the cheapest check
   there is.
4. Download **⬇ Cut file (DXF, inches)** and send it to a laser or knife cutter. When the two panels are
   mirror images it is one file: cut two and turn one over.

## 6. Buy the parts (Electronics)

Open **Electronics**. The main area shows four sheets: **Circuit**, **Wiring**, **Hub module** and
**Board** (the carrier board, all through-hole for a DIY build). The settings are the battery (*18650
cells*, *Cell capacity*) and the *Current limit* for the LEDs.

**⬇ Shopping list (CSV)** downloads every part with its quantity, supplier, price and link; **Copy list**
copies it as plain text. [docs/electronics.md](electronics.md) explains the design.

## 7. Save your setup

At the top of the settings panel, type a name for your setup in the box beside **Setup**: it names the
file. **Save** downloads the whole setup (the hardware and every preset, your pictures included) as a
`.json` file. **Open**, or dropping that file on the page, loads it again, on this computer or another.

The browser also keeps your setup between visits, but keep the saved file anyway: a new version of the
app with different defaults starts every browser over from them once. **Reset** (click twice) goes back to
the defaults.

## 8. Build it

With the panels cut and the parts in hand, follow the assembly steps in
[docs/panels.md](panels.md#how-it-works) (*Assembly*) and the electronics notes in
[docs/electronics.md](electronics.md).

## Going further

- The [README](../README.md) describes every preset, banner mode, the water and the other physics looks,
  and has a full settings reference.
- **Simulator → Firmware → Compare with Adafruit** shows how the same wheel would look with Adafruit's
  CircuitPython firmware from its bike-wheel guide.
- [docs/panels.md](panels.md) explains how the panels are designed and what each panel setting does.
