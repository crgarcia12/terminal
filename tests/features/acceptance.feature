Feature: Web version of Windows Terminal

  Background:
    Given the repository has been cloned and "pnpm install" has completed successfully
    And the dev server has been started with "pnpm --filter @terminal/web dev"
    And a browser is open at "http://localhost:5173"

  Scenario: Dev server boots a working shell
    When the page finishes loading
    Then a terminal grid of 80 columns by 24 rows is visible
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

  Scenario: VT parser unit tests meet coverage
    When the command "pnpm --filter @terminal/web test:parser -- --coverage" is executed
    Then the test runner exits with code 0
    And the reported line coverage for "src/core/parser" is at least 90 percent

  Scenario: Large output, selection, and clipboard
    Given the terminal is focused
    When a Playwright test writes 1048576 bytes of "y\n" lines to the PTY
    And the test scrolls 5000 lines upward
    And the test selects 3 consecutive lines and presses "Ctrl+Shift+C"
    Then the system clipboard contains exactly those 3 lines joined by newline characters

  Scenario: CI workflow is green
    When a pull request is opened against the "main" branch
    Then the GitHub Actions workflow named "web-ci" completes with status "success"
    And the Azure pipeline "Terminal CI" also completes with status "success"

  Scenario: Production bundle size budget
    When the command "pnpm --filter @terminal/web build" is executed
    Then the gzipped size of the main JS chunk in "web/app/dist/assets" is less than or equal to 358400 bytes

  Scenario: Documentation is published
    When a contributor opens "web/README.md"
    Then the document contains sections titled "Architecture", "Development", "PTY Transports", and "Out of Scope"
