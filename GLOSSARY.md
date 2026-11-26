# Basic Bingo

The language for how the app's state is held, changed, saved and shown. Product terms (calls, patterns,
the Controller and Presentation windows) are defined in [docs/product-design.md](docs/product-design.md).

## State

**App state**:
Everything that app commands change, whether the operator or the clock sends them: the game, patterns,
media, slideshows, the countdown timer, the games-played log, the presentation mode, settings, and slideshow
playback.
_Avoid_: durable state (playback is part of it and is never saved), store state

**App data**:
The part of the app state that is saved to disk. Slideshow playback is not part of it.
_Avoid_: persisted state, save file (that is the on-disk document)

**Window state**:
What the main process knows about the windows and the machine: the Presentation window's status, the
connected displays, operator notices, and whether the last save worked. Never changed by an app command.
_Avoid_: runtime state

**App snapshot**:
The app state plus the window state, stamped with a revision, sent to every window after each change.
_Avoid_: state, model

**App command**:
One requested change to the app state, labelled with the area it belongs to (the game, the games-played log,
patterns, media, slideshows, playback, the timer, the presentation mode, settings).
_Avoid_: action, event, message
