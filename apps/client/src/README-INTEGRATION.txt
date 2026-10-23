CodeRoom UI update

Files in this package: App.tsx, CodeEditor.tsx, SocketConnection.tsx, AuthScreen.tsx, AuthScreen.css, SocketConnection.css.

Install: back up the matching files in apps/client/src, then copy these files into apps/client/src. Do not replace App.css.

Signup role behavior: Candidate can register publicly. Interviewer is selectable in the UI so the role policy is visible, but public interviewer signup is intentionally blocked because the current backend registerUser() explicitly rejects interviewer roles. Interviewer accounts must be provisioned by an administrator. Do not weaken that backend check just to expose a signup option.

The Socket.IO session now uses a card-based responsive layout instead of plain headings and inputs. CodeEditor continues to receive token and role props for authenticated execution and candidate-only AI feedback.

Please run npm run build in apps/client and test candidate signup, interviewer login, room join, execution, and AI feedback. This package has not been run against your local backend.
