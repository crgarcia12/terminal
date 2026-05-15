# Cucumber-style acceptance scenarios for the Web Terminal slice.
# Wired against the Playwright e2e harness; currently disabled in CI (see web-ci.yml).

Feature: Web version of Windows Terminal

  Background:
    Given the repository has been cloned and "npm install" has completed successfully
    And the dev server has been started with "node web/server/dev.mjs"
    And a browser is open at the dev server URL

  Scenario: Dev server boots a working shell
    When the page finishes loading
    Then a terminal grid is visible
    And a shell prompt rendered by the user's default shell is shown within 2 seconds

  Scenario: Echo a command
    Given the terminal is focused
    When the user types "echo hello" and presses Enter
    Then a new line containing exactly "hello" appears in the terminal output

  Scenario: Open a new tab and split a pane
    Given one tab is open
    When the user presses "Ctrl+Shift+T"
    Then a second tab labeled with the default profile name appears and becomes active
    When the user presses "Ctrl+Shift+D"
    Then the active tab is split into two panes side by side
    And typing "pwd" into the right pane shows output only in the right pane

  Scenario: Apply user settings
    Given a settings.json stored in localStorage with colorScheme "Campbell Powershell" and fontSize 16
    When the user reloads the page
    Then the terminal background matches the "Campbell Powershell" background color "#012456"
    And the rendered glyph height corresponds to a 16px font size

  Scenario: Production bundle size budget
    When the command "npm run build" is executed
    Then the gzipped size of the main JS chunk in "web/app/dist/assets" is less than or equal to 358400 bytes
