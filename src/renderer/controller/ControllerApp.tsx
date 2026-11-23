import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ControllerApi } from '../../shared/ipc/contract';
import type { SnapshotStore } from '../shared/snapshotStore';
import { useMediaQuery } from '../shared/useMediaQuery';
import { useSnapshotState } from '../shared/useSnapshotState';
import { BallGrid } from './components/BallGrid';
import { CallSummaryPanel } from './components/CallSummaryPanel';
import { CountdownPanel } from './components/CountdownPanel';
import { BingoBannerControl, NewGameControl } from './components/GameControls';
import { CopyrightFooter } from './components/CopyrightFooter';
import { nextGameNumber } from '../../shared/games/gameLog';
import { GameClock } from './components/GameClock';
import { GamesPlayed } from './components/GamesPlayed';
import { modeTabId, ModeTabs } from './components/ModeTabs';
import { NoticeArea } from './components/NoticeArea';
import { PatternCard } from './components/PatternCard';
import { PatternWidget } from './components/PatternWidget';
import { PatternsView } from './components/PatternsView';
import { PresentationControls } from './components/PresentationControls';
import { SingleImagePanel } from './components/SingleImagePanel';
import { SlideshowPanel } from './components/SlideshowPanel';
import { ThemeSwitch } from './components/ThemeSwitch';
import styles from './ControllerApp.module.css';
import { useControllerActions } from './useControllerActions';
import { useControllerTheme } from './useControllerTheme';

export interface ControllerAppProps {
  readonly api: ControllerApi;
  readonly store: SnapshotStore;
}

/** Operator console: ball grid, call summary and projector controls. */
export function ControllerApp({ api, store }: ControllerAppProps) {
  const state = useSnapshotState(store);
  const actions = useControllerActions(api);
  const panelId = useId();
  // Which screen the operator is on. Only the layout cares: the game, the patterns and the projector all
  // live in the main process, so switching screens never changes (or loses) any of them.
  const [view, setView] = useState<'game' | 'patterns'>('game');
  const back = useRef<HTMLButtonElement>(null);
  const editPatterns = useRef<HTMLButtonElement>(null);
  const movingFocus = useRef(false);
  const changeView = (next: typeof view) => {
    movingFocus.current = true;
    setView(next);
  };
  useLayoutEffect(() => {
    if (!movingFocus.current) return;
    movingFocus.current = false;
    (view === 'patterns' ? back : editPatterns).current?.focus();
  }, [view]);
  // Which pattern UI there is, and where New Game is, depends on the width: a control cannot be in two places
  // at once, so these choices are made in code. The widths match the breakpoints in ControllerApp.module.css.
  //   from 1440 wide and 780 high: a left rail with New Game and the pattern widget (the rail is about 610 px
  //     tall, so a wide but short window gets the strip instead)
  //   from 1141 wide otherwise: New Game in the top bar and the pattern widget as a strip above the board
  //   below 1141 (the compact layout): New Game in the top bar and a small Pattern card
  const wideLayout = useMediaQuery('(min-width: 1141px)');
  const railLayout = useMediaQuery('(min-width: 1440px) and (min-height: 780px)');
  // Wide enough for the tabs and the projector controls to share the top bar (see ControllerApp.module.css).
  const topRow = useMediaQuery('(min-width: 1366px)');
  useControllerTheme(state.status === 'ready' ? state.snapshot.controllerTheme : undefined);

  if (state.status === 'loading') {
    return <div className={styles.message}>Loading game…</div>;
  }
  if (state.status === 'error') {
    return (
      <div className={styles.message} role="alert">
        Could not connect to the game engine: {state.message}
      </div>
    );
  }

  const { snapshot } = state;
  const countdown = {
    timer: snapshot.timer,
    onDuration: actions.setTimerDuration,
    onMessage: actions.setCountdownMessage,
    onStart: actions.startTimer,
    onPause: actions.pauseTimer,
    onResume: actions.resumeTimer,
    onReset: actions.resetTimer,
  };
  const { calledNumbers, bingoBannerVisible } = snapshot.game;
  const mode = snapshot.presentationMode;
  // Anything but the ball board (the Patterns screen, a mode placeholder) takes the full height of its area.
  const fill = view === 'patterns' || mode !== 'gameBoard';
  const newGame = (
    <NewGameControl
      calledCount={calledNumbers.length}
      bannerVisible={bingoBannerVisible}
      onNewGame={actions.newGame}
    />
  );
  // The game clock appears with the first ball and goes with New Game. It holds at BINGO CALLED (see GameClock).
  const clock =
    snapshot.gameLog.current.firstBallAt === null ? null : (
      <GameClock gameNumber={nextGameNumber(snapshot.gameLog)} clock={snapshot.gameLog.current} />
    );
  const tabs = (
    <div className={styles.tabs}>
      {view === 'game' ? (
        <ModeTabs mode={mode} onSelect={actions.setPresentationMode} panelId={panelId} />
      ) : (
        <button ref={back} type="button" className={styles.back} onClick={() => changeView('game')}>
          <span aria-hidden="true">‹</span> Back to game
        </button>
      )}
      {/* Narrower than the merged top bar: the clock takes the room to the right of the tabs. */}
      {topRow ? null : clock}
    </div>
  );
  const widget = (variant: 'rail' | 'strip') => (
    <PatternWidget
      variant={variant}
      library={snapshot.patternLibrary}
      active={snapshot.activePattern}
      shown={snapshot.shownPattern}
      onSwitch={actions.switchPattern}
      onSetCell={actions.setPatternCell}
      onRename={actions.renameActivePattern}
      onShow={actions.showPatternOnProjector}
      onHide={actions.hidePatternOnProjector}
      editButtonRef={editPatterns}
      onEditPatterns={() => changeView('patterns')}
    />
  );
  const onGame = view === 'game';
  // New Game, the pattern, BINGO CALLED and the call summary belong to the game, so they are shown only on the
  // Game Board tab. The break modes (slideshow, single image, countdown) get the whole window.
  const onBoard = mode === 'gameBoard';
  const bingo = (
    <div className={styles.bingo}>
      <BingoBannerControl
        bannerVisible={bingoBannerVisible}
        onShow={actions.showBingoBanner}
        onDismiss={actions.dismissBingoBanner}
      />
    </div>
  );
  const summary = (
    <div className={styles.summary}>
      <CallSummaryPanel calledNumbers={calledNumbers} />
    </div>
  );
  const side = (
    <div className={styles.side}>
      {bingo}
      {summary}
    </div>
  );
  return (
    <div className={styles.app}>
      <main
        className={styles.layout}
        data-view={view}
        data-fill={fill}
        data-mode={onBoard ? 'board' : 'panel'}
      >
        <header className={styles.header}>
          <h1 className={styles.title}>Basic Bingo</h1>
          {topRow ? tabs : null}
          {topRow ? clock : null}
          <div className={styles.projector}>
            <PresentationControls
              displays={snapshot.displays}
              presentation={snapshot.presentation}
              preferredDisplayId={snapshot.preferredDisplayId}
              onProject={actions.openPresentation}
              onPreview={actions.openPreview}
              onStop={actions.closePresentation}
            />
          </div>
          {railLayout || !onBoard ? null : newGame}
          <ThemeSwitch theme={snapshot.controllerTheme} onChange={actions.setControllerTheme} />
        </header>

        {topRow ? null : tabs}
        {onBoard && !wideLayout ? bingo : null}

        {/* Empty (and hidden by CSS) unless there is something to tell the operator. */}
        <div className={styles.notices}>
          <NoticeArea
            notices={snapshot.notices}
            persistence={snapshot.persistence}
            actionError={actions.lastError}
            onDismissNotice={actions.dismissNotice}
            onDismissActionError={actions.clearError}
            onRetrySave={actions.retrySave}
            onShowDataFolder={actions.showDataFolder}
          />
        </div>

        {/* Follow the visual order at each breakpoint so Tab never jumps back over the grid. */}
        {railLayout && onBoard ? (
          <div className={styles.rail}>
            {newGame}
            {onGame ? widget('rail') : null}
          </div>
        ) : null}
        {wideLayout && !railLayout && onBoard ? (
          <>
            {onGame ? <div className={styles.strip}>{widget('strip')}</div> : null}
            {side}
          </>
        ) : null}
        {!wideLayout && onBoard ? (
          <>
            {summary}
            {onGame ? (
              <div className={styles.pattern}>
                <PatternCard
                  ref={editPatterns}
                  active={snapshot.activePattern}
                  onOpen={() => changeView('patterns')}
                />
              </div>
            ) : null}
          </>
        ) : null}

        {view === 'game' ? (
          <div className={styles.panel} role="tabpanel" id={panelId} aria-labelledby={modeTabId(mode)}>
            {mode === 'gameBoard' ? (
              <BallGrid
                calledNumbers={calledNumbers}
                disabledRows={snapshot.game.disabledRows}
                locked={bingoBannerVisible}
                onToggle={actions.toggleBall}
                onToggleRow={actions.toggleRow}
              />
            ) : mode === 'singleImage' ? (
              <SingleImagePanel
                library={snapshot.mediaLibrary}
                singleImage={snapshot.singleImage}
                onSelect={actions.selectSingleImage}
                onFit={actions.setImageFit}
                onImport={actions.importImages}
                onRemove={actions.removeImage}
              />
            ) : mode === 'countdown' ? (
              <CountdownPanel {...countdown} />
            ) : (
              <SlideshowPanel
                slideshow={snapshot.slideshow}
                playback={snapshot.slideshowPlayback}
                countdown={countdown}
                library={snapshot.mediaLibrary}
                onEdit={actions.editSlideshow}
                onPlayback={actions.controlSlideshow}
                onImport={actions.importSlideshowImages}
                onImportPowerPoint={actions.importPowerPoint}
                importingPowerPoint={actions.importingPowerPoint}
              />
            )}
          </div>
        ) : (
          <div className={styles.panel}>
            <PatternsView
              library={snapshot.patternLibrary}
              active={snapshot.activePattern}
              onSwitch={actions.switchPattern}
              onSetCell={actions.setPatternCell}
              onRename={actions.renameActivePattern}
              onUpdateSaved={actions.updateSavedPattern}
              onSaveAsNew={actions.saveActivePatternAsNew}
              onNewPattern={actions.createBlankPattern}
              onRenamePattern={actions.renameSavedPattern}
              onDuplicatePattern={actions.duplicatePattern}
              onDeletePattern={actions.deletePattern}
            />
          </div>
        )}

        {railLayout && onBoard ? side : null}

        {/* Under the board, in the row the wide layouts leave empty. The stacked layout has no room for it. */}
        {wideLayout && onGame && onBoard ? (
          <div className={styles.log}>
            <GamesPlayed records={snapshot.gameLog.records} onClear={actions.clearGameLog} />
          </div>
        ) : null}
      </main>
      <CopyrightFooter />
    </div>
  );
}
