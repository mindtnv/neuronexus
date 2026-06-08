import common from './ru/common';
import home from './ru/home';
import review from './ru/review';
import decks from './ru/decks';
import editor from './ru/editor';
import cards from './ru/cards';
import chat from './ru/chat';
import stats from './ru/stats';
import settings from './ru/settings';
import garden from './ru/garden';
import overlays from './ru/overlays';
import graph from './ru/graph';
import empty from './ru/empty';
import sessionComplete from './ru/session-complete';
import noteTypes from './ru/note-types';

const messages = {
  ...common,
  home,
  review,
  decks,
  editor,
  cards,
  chat,
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
