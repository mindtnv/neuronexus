import common from './en/common';
import home from './en/home';
import review from './en/review';
import decks from './en/decks';
import editor from './en/editor';
import cards from './en/cards';
import stats from './en/stats';
import settings from './en/settings';
import garden from './en/garden';
import overlays from './en/overlays';
import graph from './en/graph';
import empty from './en/empty';
import sessionComplete from './en/session-complete';
import noteTypes from './en/note-types';

const messages = {
  ...common,
  home,
  review,
  decks,
  editor,
  cards,
  stats,
  settings,
  garden,
  overlays,
  graph,
  empty,
  session: sessionComplete,
  noteTypes,
};

export default messages;
