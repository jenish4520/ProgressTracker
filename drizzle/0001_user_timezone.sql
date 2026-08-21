-- The server must agree with the user's phone about what day it is.
--
-- Without this the server computes "today" in its own timezone (UTC on most
-- hosts). For a user in Germany that is wrong for the first two hours of every
-- day: a 00:30 snack would be filed against yesterday's calorie budget, and
-- server-rendered "Today" labels would disagree with the browser's.
ALTER TABLE users ADD COLUMN timezone text NOT NULL DEFAULT 'UTC';
