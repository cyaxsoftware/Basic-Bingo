/**
 * The app state and the one function that changes it.
 *
 * Every app command, whether the Controller sends it or the main process does (an import finishing, a deadline
 * passing), goes through `reduceAppState`. The rules of each area live in their own modules (the game, patterns,
 * media, slideshows, playback, the timer, the games-played log); this module holds the rules that tie areas together,
 * so the main-process store and the renderer test fake can never apply them differently:
 *  - a game change is also logged in the games-played log, timed with the same clock;
 *  - removing a library image drops its slides, and any slideshow change reconciles playback;
 *  - changing the presentation mode stops the slideshow;
 *  - playback can only be started, held or continued while the slideshow is shown.
 *
 * Pure: the clock and new ids come in through the context. A command that changes nothing returns the SAME state
 * object, so callers can skip publishing and saving. A rejected command returns `ok: false` with the reason; this
 * module never throws.
 */
import { reduceGame, INITIAL_GAME_STATE, type GameCommand, type GameState } from '../game/gameState';
import { applyGameChange, clearGameRecords, EMPTY_GAME_LOG, type GameLogState } from '../games/gameLog';
import {
  INITIAL_MEDIA_STATE,
  reduceMedia,
  type MediaCommand,
  type MediaItem,
  type SingleImageState,
} from '../media';
import {
  appendSlideshowImages,
  EMPTY_SLIDESHOW,
  reduceSlideshow,
  removeImageFromSlideshows,
  type SlideshowCommand,
  type SlideshowState,
} from '../media/slideshow';
import {
  activeSlideshow,
  advanceSlideshow,
  reconcileSlideshowPlayback,
  reduceSlideshowPlayback,
  stopSlideshow,
  STOPPED_SLIDESHOW,
  type SlideshowPlayback,
  type SlideshowPlaybackCommand,
} from '../media/slideshowPlayback';
import {
  blankActivePattern,
  createDefaultLibrary,
  reducePatterns,
  type ActivePattern,
  type PatternCommand,
  type PatternLibrary,
  type ShownPattern,
} from '../patterns';
import { DEFAULT_PRESENTATION_MODE, type PresentationMode } from '../presentation/presentationMode';
import { DEFAULT_CONTROLLER_THEME, type ControllerTheme } from '../theme/controllerTheme';
import { DEFAULT_TIMER, reduceTimer, type TimerCommand, type TimerState } from '../timer/timerState';

/** Everything that app commands change. See GLOSSARY.md. */
export interface AppState {
  /** Canonical game state. Saved. */
  readonly game: GameState;
  /** Saved: which view the audience display shows. Separate from the game. */
  readonly presentationMode: PresentationMode;
  /** Saved: the pattern library. Separate from the game. */
  readonly patternLibrary: PatternLibrary;
  /** Saved: the working copy of a pattern the game is showing (edits never touch the library by themselves). */
  readonly activePattern: ActivePattern;
  /** Saved: the pattern the operator last pushed to the projector (a snapshot, not the working copy), or null. */
  readonly shownPattern: ShownPattern | null;
  /** Saved: the imported images (metadata; the files are in the media folder, shown through bingo-media://). */
  readonly mediaLibrary: readonly MediaItem[];
  /** Saved: which library image the Single Image mode shows (each image has its own Fit / Fill). */
  readonly singleImage: SingleImageState;
  /** Saved: the countdown timer, independent of the game and the presentation mode. */
  readonly timer: TimerState;
  /** Saved: the slideshow collections and which one is active. */
  readonly slideshow: SlideshowState;
  /** Not saved: which slide is showing and whether it advances. Every launch starts stopped. */
  readonly slideshowPlayback: SlideshowPlayback;
  /** Saved: the games played (when, which pattern, how long) and the clock of the game in progress. */
  readonly gameLog: GameLogState;
  /** Saved as a convenience only: the last display the operator projected to. */
  readonly preferredDisplayId: number | null;
  /** Saved: the Controller's colour theme. The Presentation window ignores it. */
  readonly controllerTheme: ControllerTheme;
}

/** Main adds images to a collection once it has copied them into the media folder. */
export interface AddSlideshowImagesCommand {
  readonly type: 'addImages';
  readonly collectionId: string;
  readonly images: readonly MediaItem[];
}

/** The slideshow deadline service: the slide whose deadline this is has been shown long enough. */
export interface AdvanceSlideshowCommand {
  readonly type: 'advance';
  readonly deadline: number;
}

export type SettingsCommand =
  | { readonly type: 'setControllerTheme'; readonly theme: ControllerTheme }
  | { readonly type: 'setPreferredDisplay'; readonly displayId: number | null };

/**
 * One requested change to the app state, labelled with its area. Each area's own command type is unchanged; the
 * label keeps names that areas share (the timer's and the slideshow's `start`, for example) apart.
 */
export type AppCommand =
  | { readonly area: 'game'; readonly command: GameCommand }
  | { readonly area: 'gameLog'; readonly command: { readonly type: 'clear' } }
  | { readonly area: 'patterns'; readonly command: PatternCommand }
  | { readonly area: 'media'; readonly command: MediaCommand }
  | { readonly area: 'slideshow'; readonly command: SlideshowCommand | AddSlideshowImagesCommand }
  | { readonly area: 'playback'; readonly command: SlideshowPlaybackCommand | AdvanceSlideshowCommand }
  | { readonly area: 'timer'; readonly command: TimerCommand }
  | {
      readonly area: 'presentationMode';
      readonly command: { readonly type: 'setMode'; readonly mode: PresentationMode };
    }
  | { readonly area: 'settings'; readonly command: SettingsCommand };

export interface AppStateContext {
  /** When the command is applied. */
  readonly now: Date;
  /** A fresh, unused id for anything the command creates (a pattern, a collection, a games-played record). */
  readonly newId: () => string;
}

export type AppStateResult =
  | { readonly ok: true; readonly state: AppState }
  | { readonly ok: false; readonly error: string };

/** The app state of a first launch: nothing saved yet. */
export function createInitialAppState(): AppState {
  return {
    game: INITIAL_GAME_STATE,
    presentationMode: DEFAULT_PRESENTATION_MODE,
    patternLibrary: createDefaultLibrary(),
    activePattern: blankActivePattern(),
    shownPattern: null,
    mediaLibrary: INITIAL_MEDIA_STATE.library,
    singleImage: INITIAL_MEDIA_STATE.singleImage,
    timer: DEFAULT_TIMER,
    slideshow: EMPTY_SLIDESHOW,
    slideshowPlayback: STOPPED_SLIDESHOW,
    gameLog: EMPTY_GAME_LOG,
    preferredDisplayId: null,
    controllerTheme: DEFAULT_CONTROLLER_THEME,
  };
}

/**
 * Apply one app command. Returns the next state (the same object when nothing changed), or the reason the command
 * was refused, in which case nothing changed.
 *
 * `state` may be a wider object (the store passes its whole snapshot); the fields it does not know are carried
 * through untouched.
 */
export function reduceAppState<S extends AppState>(
  state: S,
  command: AppCommand,
  context: AppStateContext,
): { readonly ok: true; readonly state: S } | { readonly ok: false; readonly error: string } {
  try {
    return { ok: true, state: apply(state, command, context) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function apply<S extends AppState>(state: S, appCommand: AppCommand, { now, newId }: AppStateContext): S {
  const nowMs = now.getTime();
  switch (appCommand.area) {
    case 'game': {
      const { command } = appCommand;
      const game = reduceGame(state.game, command);
      if (game === state.game) return state;
      // The log sees the same change at the same moment, so the first ball, the last BINGO CALLED press and New
      // Game are timed exactly when they happen. The game rules themselves never see a clock.
      const gameLog = applyGameChange(state.gameLog, {
        command,
        before: state.game,
        after: game,
        now: nowMs,
        patternTitle: state.activePattern.title,
        newId,
      });
      return { ...state, game, gameLog };
    }
    case 'gameLog': {
      const gameLog = clearGameRecords(state.gameLog);
      return gameLog === state.gameLog ? state : { ...state, gameLog };
    }
    case 'patterns': {
      const current = {
        library: state.patternLibrary,
        active: state.activePattern,
        shown: state.shownPattern,
      };
      const next = reducePatterns(current, appCommand.command, { now: now.toISOString(), newId });
      if (next === current) return state;
      return { ...state, patternLibrary: next.library, activePattern: next.active, shownPattern: next.shown };
    }
    case 'media': {
      const { command } = appCommand;
      const current = { library: state.mediaLibrary, singleImage: state.singleImage };
      const next = reduceMedia(current, command);
      if (next === current) return state;
      const changed = { ...state, mediaLibrary: next.library, singleImage: next.singleImage };
      // A removed image leaves every collection in the same change, so no snapshot or save ever has a slide that
      // points at nothing.
      return command.type === 'removeMedia'
        ? withSlideshow(changed, removeImageFromSlideshows(state.slideshow, command.mediaId), nowMs)
        : changed;
    }
    case 'slideshow': {
      const { command } = appCommand;
      const slideshow =
        command.type === 'addImages'
          ? appendSlideshowImages(state.slideshow, command.collectionId, command.images, state.mediaLibrary)
          : reduceSlideshow(state.slideshow, command, newId);
      return withSlideshow(state, slideshow, nowMs);
    }
    case 'playback': {
      const { command } = appCommand;
      const collection = activeSlideshow(state.slideshow);
      let slideshowPlayback: SlideshowPlayback;
      if (command.type === 'advance') {
        slideshowPlayback = advanceSlideshow(state.slideshowPlayback, collection, command.deadline, nowMs);
      } else {
        if (state.presentationMode !== 'slideshow') throw new Error('Open Slideshow to control playback.');
        slideshowPlayback = reduceSlideshowPlayback(state.slideshowPlayback, collection, command, nowMs);
      }
      return slideshowPlayback === state.slideshowPlayback ? state : { ...state, slideshowPlayback };
    }
    case 'timer': {
      const timer = reduceTimer(state.timer, appCommand.command, nowMs);
      return timer === state.timer ? state : { ...state, timer };
    }
    case 'presentationMode': {
      const { mode } = appCommand.command;
      if (mode === state.presentationMode) return state;
      return { ...state, presentationMode: mode, slideshowPlayback: stopSlideshow(state.slideshowPlayback) };
    }
    case 'settings':
      return applySetting(state, appCommand.command);
  }
  const unknownCommand: never = appCommand;
  throw new Error(`Unhandled app command: ${String((unknownCommand as { area?: unknown }).area)}`);
}

function applySetting<S extends AppState>(state: S, command: SettingsCommand): S {
  switch (command.type) {
    case 'setControllerTheme':
      return command.theme === state.controllerTheme ? state : { ...state, controllerTheme: command.theme };
    case 'setPreferredDisplay':
      return command.displayId === state.preferredDisplayId
        ? state
        : { ...state, preferredDisplayId: command.displayId };
  }
}

/** A changed slideshow brings playback with it: a removed slide or a switched collection can stop it. */
function withSlideshow<S extends AppState>(state: S, slideshow: SlideshowState, nowMs: number): S {
  if (slideshow === state.slideshow) return state;
  return {
    ...state,
    slideshow,
    slideshowPlayback: reconcileSlideshowPlayback(state.slideshowPlayback, state.slideshow, slideshow, nowMs),
  };
}
