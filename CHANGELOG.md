# Change Log

## Version 2.0.1: November 04, 2024
### Enhancements
* Readme tree delete demo.
### Fix
* Copy to global.

## Version 2.0.0: October 10, 2024
### New Features
* New icon.
* Add `treeView` manager.
### Enhancements
* Quickpick now have a section for `active` editor.
* Zindex for the css background properties.
### Fix
* Quickpick without name and regex.

## Version 1.5.0: September 29, 2024
### New Features
* Add `highlight.regex.choose.names` command for quickpick regex by name.
* Add `name` setting in `regexes` object.
* Add `description` setting in `regexes` object.
* Add `active` setting in `regexes` object.

## Version 1.4.3: September 18, 2024
### Fix
* Decorations artifacts.

## Version 1.4.2: September 18, 2024
### Fix
* Order of decoration index.

## Version 1.4.1: September 18, 2024
### Fix
* Old decorations at update event.

## Version 1.4.0: September 16, 2024
### Update
* Rename `highlight.regex.timeout` setting to `highlight.regex.delay`.
* Remove delay at change visibility event.
* `regex` setting accept array of strings.
* Examples.
* README.
### New Features
* Use vscode log in output channel.
* Add `languageRegex` setting in `regexes` object.
* Add `filenameRegex` setting in `regexes` object.
* Add automatic `z-index` level css for background.

## Version 1.3.1: September 9, 2024
### Fix
* Cache with toggle command.

## Version 1.3.0: September 9, 2024
### New Features
* Cache decorations.
* Cache limit setting `highlight.regex.cacheLimit`.

## Version 1.2.2: July 11, 2024
### Update
* README: Demo gif.

## Version 1.2.1: July 10, 2024
### Fix
* Gave nested regexes higher priority on decorations.
* Reset limit regex each search.

## Version 1.2.0: January 16, 2024
### New Features
* Scope settings `highlight.regex.machine.regexes` and `highlight.regex.workspace.regexes`.
* Toggle scope commands `highlight.regex.toggle`, `highlight.regex.global.toggle`, `highlight.regex.machine.toggle`, `highlight.regex.workspace.toggle`.

## Version 1.1.0: January 08, 2024
### New Features
* Property hoverMessage.

## Version 1.0.0: August 19, 2023
### New Features
* Use name capture group like index.
### Fix
* Capture group not preceded by another capture group.

## Version 0.4.3: April 20, 2023
### Update
* Examples.
* README.

## Version 0.4.2: January 26, 2023
### New Features
* Add error popup when your configuration is bad.

## Version 0.4.0: April 27, 2022
### Enhancements
* Rename `languages` in `highlight.regex.regexes` setting to `languageIds`.
* Remove `highlight.regex.showReadme` command.