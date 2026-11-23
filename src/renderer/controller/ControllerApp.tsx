import { useId, useState } from 'react';
import type { ControllerApi } from '../../shared/ipc/contract';
import type { SnapshotStore } from '../shared/snapshotStore';
import { useMediaQuery } from '../shared/useMediaQuery';
import { useSnapshotState } from '../shared/useSnapshotState';
import { BallGrid } from './components/BallGrid';
import { CallSummaryPanel } from './components/CallSummaryPanel';
import { CountdownPanel } from './components/CountdownPanel';
import { BingoBannerControl, NewGameControl } from './components/GameControls';
import { CopyrightFooter } from './components/CopyrightFooter';
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
  const tabs = (
    <div className={styles.tabs}>
      {view === 'game' ? (
        <ModeTabs mode={mode} onSelect={actions.setPresentationMode} panelId={panelId} />
      ) : (
        <button type="button" className={styles.back} onClick={() => setView('game')}>
          <span aria-hidden="true">‹</span> Back to game
        </button>
      )}
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
      onEditPatterns={() => setView('patterns')}
    />
  );
  const onGame = view === 'game';
  // New Game, the pattern, BINGO CALLED and the call summary belong to the game, so they are shown only on the
  // Game Board tab. The break modes (slideshow, single image, countdown) get the whole window.
  const onBoard = mode === 'gameBoard';
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

        {/* Empty (and hidden by CSS) unless there is something to tell the operator. */}
        <div className={styles.notices}>
          <NoticeArea
            notices={snapshot.notices}
            persistence={snapshot.persistence}
            actionError={actions.lastError}
            onDismissNotice={actions.dismissNotice}
            onDismissActionError={actions.clearError}
          />
        </div>

        {view === 'game' ? (
          <div className={styles.panel} role="tabpanel" id={panelId} aria-labelledby={modeTabId(mode)}>
            {mode === 'gameBoard' ? (
              <BallGrid
                calledNumbers={calledNumbers}
                disabledRows={snapshot.game.disabledRows}
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

        {railLayout && onBoard ? (
          <div className={styles.rail}>
            {newGame}
            {onGame ? widget('rail') : null}
          </div>
        ) : null}

        {wideLayout && !railLayout && onGame && onBoard ? (
          <div className={styles.strip}>{widget('strip')}</div>
        ) : null}

        {/* Beside the board on wide windows; in the stacked layout its children go to their own grid areas. */}
        {onBoard ? (
          <div className={styles.side}>
            <div className={styles.bingo}>
              <BingoBannerControl
                bannerVisible={bingoBannerVisible}
                onShow={actions.showBingoBanner}
                onDismiss={actions.dismissBingoBanner}
              />
            </div>
            <div className={styles.summary}>
              <CallSummaryPanel calledNumbers={calledNumbers} />
            </div>
            {wideLayout || !onGame ? null : (
              <div className={styles.pattern}>
                <PatternCard active={snapshot.activePattern} onOpen={() => setView('patterns')} />
              </div>
            )}
          </div>
        ) : null}
      </main>
      <CopyrightFooter />
    </div>
  );
}
