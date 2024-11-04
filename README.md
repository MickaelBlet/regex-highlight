# Highlight regex

Highlight (*decorate*) what you want with Regex in VS Code

![demo](images/demo.gif)

**Examples** available at [examples.md](examples.md)

## Choose by name(s)

**Highlight Regex: Choose by name(s)** (*highlight.regex.choose.names*) command.

![demo choose by name](images/demoChooseByName.gif)

## Tree manager

### Select

Choose from tree your regexes.

![tree select workspace](images/treeSelectWorkspace.gif)

## Edit

Edit key(s) within workspace json settings.

![tree edit workspace](images/treeEditItemWorkspace.gif)

### Priority

Change the order of regexes to adjust their priority.

![tree priority workspace](images/treePriorityWorkspace.gif)

### Delete

Delete with contectual menu.

![tree delete workspace](images/treeDeleteWorkspace.gif)

### Navigate

Navigate through regex matches in the active editor.

![tree active search](images/treeActiveSearch.gif)

## Commands

|Name|Command|Description|
|---|---|---|
|**Highlight Regex: Choose by name(s)**|*highlight.regex.choose.names*|Activate/Desactivate specific regexes|
|**Highlight Regex: Toggle**|*highlight.regex.toggle*|Activate/Desactivate all scopes regexes|
|**Highlight Regex: Global Toggle**|*highlight.regex.global.toggle*|Activate/Desactivate all regexes of global scope|
|**Highlight Regex: Workspace Toggle**|*highlight.regex.workspace.toggle*|Activate/Desactivate all regexes of workspace scope|

## Basic Settings

|Name|Description|Default|
|---|---|---|
|**highlight.regex.cacheLimit**|Limit of cache|1000|
|**highlight.regex.defaultRegexLimit**|Default limit of search regex|50000|
|**highlight.regex.defaultRegexFlag**|Default regex flag|gm|
|**highlight.regex.delay**|Delay to applicate decorations after update events (in milliseconds)|200|

## Regexes Settings

The **highlight.regex.regexes** and **highlight.regex.workspace.regexes** properties take a list of objects.  
The first object level can include the following properties:

|Name|Description|
|---|---|
|**name**|A name of regexes|
|**description**|A description of regexes|
|**active**|Set to false for disable these regexes|
|**languageIds**|A list of language IDs used to apply child decorations|
|**languageRegex**|If languageIds not define, A regex pattern that, when matched with the language ID, applies child decorations|
|**filenameRegex**|A regex pattern that, when matched with the file path, applies child decorations|
|**regexes**|A list of objects with the [Regexes child settings](#regexes-child-settings) properties|

### Regexes child settings

|Name|Description|
|---|---|
|**index**|The index or name of the matched regex group (default is 0)|
|**regex**|The regex pattern to be applied (string or strings list)|
|**regexFlag**|The flag for the regex (default is **highlight.regex.defaultRegexFlag**)|
|**regexLimit**|The limit on how many matches the regex can find (default is **highlight.regex.defaultRegexLimit**)|
|**decorations**|A list of [VS Code decorations](https://code.visualstudio.com/api/references/vscode-api#DecorationRenderOptions)<br>- Optionnal **index** property to indicate the index or name of the matched regex group.<br>- Optionnal **hoverMessage** property to add a message when hovering over a match group|
|**regexes**|A list of child [Regexes child settings](#regexes-child-settings)|

### Default "highlight.regex.regexes" setting
```jsonc
"highlight.regex.regexes": [
  {
    "name": "TODO/CRITICAL",
    "description": "Show todo and critical keyword on comment(s)",
    "languageRegex": "\\b(c|cpp|go|java|javascript|php|rust|typescript)\\b",
    "regexes": [
      {
        // regex to find all within comments
        "regex": [
          "(/\\*[^]*?\\*/)",
          "|",
          "(//[^]*?(?:(?<!\\\\)$))"
        ],
        "regexFlag": "gm",
        "regexLimit": 25000,
        "regexes": [
          {
            "index": 0, // 0 for take all regex match (this is optionnal)
            "regex": [
              "\\b(?<todo>TODO)\\b",
              "|",
              "\\b(CRITICAL)\\b"
            ],
            "regexFlag": "gmi",
            "regexLimit": 25000,
            "decorations": [
              {
                "index": "todo", // match regex named group (todo)
                "borderRadius": "4px",
                "fontWeight": "bold",
                "overviewRulerColor": "#FF9900FF",
                "overviewRulerLane": 4,
                "light": {
                  "color": "#000000",
                  "backgroundColor": "#FF990050",
                  "border": "1px solid #FF990090"
                },
                "dark": {
                  "color": "#FFFFFF",
                  "backgroundColor": "#FF990090",
                  "border": "1px solid #FF990050"
                }
              },
              {
                "index": 2, // (CRITICAL)
                "borderRadius": "4px",
                "fontWeight": "bold",
                "overviewRulerColor": "#FF0000FF",
                "overviewRulerLane": 4,
                "light": {
                  "color": "#000000",
                  "backgroundColor": "#FF000050",
                  "border": "1px solid #FF000090"
                },
                "dark": {
                  "color": "#FFFFFF",
                  "backgroundColor": "#FF990090",
                  "border": "1px solid #FF990050"
                }
              }
            ]
          }
        ]
      }
    ]
  }
]
```

<p align="center">
  <img src="images/settingRegexes.drawio.png" >
</p>