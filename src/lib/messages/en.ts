import common from './en/common';
import home from './en/home';
import review from './en/review';
import decks from './en/decks';
import editor from './en/editor';
import stats from './en/stats';
import settings from './en/settings';
import garden from './en/garden';
import achievements from './en/achievements';
import leagues from './en/leagues';
import onboarding from './en/onboarding';
import importPdf from './en/import';
import overlays from './en/overlays';
import mobile from './en/mobile';
import graph from './en/graph';
import screensIndex from './en/screens-index';
import empty from './en/empty';
import sessionComplete from './en/session-complete';
import cardTypes from './en/card-types';

const messages = {
  ...common,
  home,
  review,
  decks,
  editor,
  stats,
  settings,
  garden,
  achievements,
  leagues,
  onboarding,
  import: importPdf,
  overlays,
  mobile,
  graph,
  screens: screensIndex,
  empty,
  session: sessionComplete,
  cards: cardTypes,
};

export default messages;
