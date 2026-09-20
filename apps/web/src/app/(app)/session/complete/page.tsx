import { redirect } from 'next/navigation';

// Existing bookmarks return to the reviewer; results now live in the session.
export default function Page() { redirect('/review'); }
