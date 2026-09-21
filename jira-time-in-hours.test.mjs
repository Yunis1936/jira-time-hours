import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const scriptPath = new URL("./jira-time-in-hours.user.js", import.meta.url);

function loadApi() {
  const sandbox = {
    __JIRA_TIME_HOURS_TEST__: {},
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(scriptPath, "utf8"), sandbox, {
    filename: scriptPath.pathname,
  });
  return sandbox.__JIRA_TIME_HOURS_TEST__.api;
}

test("converts Jira weeks, days, hours, and minutes into hours", () => {
  const api = loadApi();

  assert.equal(api.parseJiraDuration("2w 3d 1h 15m"), 105.25);
  assert.equal(api.parseJiraDuration("1ч 15м"), 1.25);
  assert.equal(api.parseJiraDuration("45m"), 0.75);
});

test("formats hours without losing fractions", () => {
  const api = loadApi();

  assert.equal(api.formatHours(50), "50 ч");
  assert.equal(api.formatHours(1.25), "1,25 ч");
  assert.equal(api.formatHours(0.75), "0,75 ч");
  assert.equal(api.formatHours(5.333333), "5,33 ч");
  assert.equal(api.formatHours(2.675), "2,68 ч");
  assert.equal(api.formatHours(5.9999), "6 ч");
});

test("does not convert unrecognised strings", () => {
  const api = loadApi();

  assert.equal(api.parseJiraDuration("about two hours"), null);
  assert.equal(api.parseJiraDuration("2h remaining"), null);
  assert.equal(api.parseJiraDuration(""), null);
});

test("switches an individual value between hours and its Jira source", () => {
  const api = loadApi();

  assert.equal(
    api.displayValue("hours", "1d 4h 45m", "12,75 ч"),
    "12,75 ч",
  );
  assert.equal(
    api.displayValue("original", "1d 4h 45m", "12,75 ч"),
    "1d 4h 45m",
  );
});
