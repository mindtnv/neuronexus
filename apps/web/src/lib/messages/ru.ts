import common from './ru/common';
import home from './ru/home';
import review from './ru/review';
import decks from './ru/decks';
import editor from './ru/editor';
import stats from './ru/stats';
import settings from './ru/settings';
import garden from './ru/garden';
import achievements from './ru/achievements';
import leagues from './ru/leagues';
import importPdf from './ru/import';
import overlays from './ru/overlays';
import mobile from './ru/mobile';
import graph from './ru/graph';
import empty from './ru/empty';
import sessionComplete from './ru/session-complete';
import cardTypes from './ru/card-types';

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
  import: importPdf,
  overlays,
  mobile,
  graph,
  empty,
  session: sessionComplete,
  cards: cardTypes,
};

export default messages;
