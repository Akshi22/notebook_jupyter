// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  IToolbarWidgetRegistry,
  createToolbarFactory,
  setToolbar
} from '@jupyterlab/apputils';

import { PageConfig } from '@jupyterlab/coreutils';

import {
  FileBrowser,
  Uploader,
  IDefaultFileBrowser
} from '@jupyterlab/filebrowser';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IRunningSessionManagers, RunningSessions } from '@jupyterlab/running';

import { ISettingEditorTracker } from '@jupyterlab/settingeditor';

import { ITranslator } from '@jupyterlab/translation';

import {
  caretDownIcon,
  FilenameSearcher,
  folderIcon,
  IScore,
  runningIcon
} from '@jupyterlab/ui-components';

import { Menu, MenuBar } from '@lumino/widgets';

import { NotebookTreeWidget, INotebookTree } from '@jupyter-notebook/tree';

/**
 * The file browser factory.
 */
const FILE_BROWSER_FACTORY = 'FileBrowser';

/**
 * The file browser plugin id.
 */
const FILE_BROWSER_PLUGIN_ID = '@jupyterlab/filebrowser-extension:browser';

/**
 * The class name added to the filebrowser filterbox node.
 */
const FILTERBOX_CLASS = 'jp-FileBrowser-filterBox';

/**
 * The namespace for command IDs.
 */
namespace CommandIDs {
  // The command to activate the filebrowser widget in tree view.
  export const activate = 'filebrowser:activate';
}

/**
 * Plugin to add extra commands to the file browser to create
 * new notebooks, files, consoles and terminals
 */
const createNew: JupyterFrontEndPlugin<void> = {
  id: '@jupyter-notebook/tree-extension:new',
  requires: [ITranslator],
  optional: [IToolbarWidgetRegistry],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator,
    toolbarRegistry: IToolbarWidgetRegistry | null
  ) => {
    const { commands } = app;
    const trans = translator.load('notebook');

    const overflowOptions = {
      overflowMenuOptions: { isVisible: false }
    };
    const menubar = new MenuBar(overflowOptions);
    const newMenu = new Menu({ commands });
    newMenu.title.label = trans.__('New');
    newMenu.title.icon = caretDownIcon;
    menubar.addMenu(newMenu);

    const newCommands = [
      'notebook:create-new',
      'terminal:create-new',
      'console:create',
      'filebrowser:create-new-file',
      'filebrowser:create-new-directory'
    ];

    newCommands.forEach(command => {
      newMenu.addItem({ command });
    });

    if (toolbarRegistry) {
      toolbarRegistry.addFactory(
        FILE_BROWSER_FACTORY,
        'new-dropdown',
        (browser: FileBrowser) => {
          const menubar = new MenuBar(overflowOptions);
          menubar.addMenu(newMenu);
          menubar.addClass('jp-DropdownMenu');
          return menubar;
        }
      );
    }
  }
};

/**
 * Plugin to load the default plugins that are loaded on all the Notebook pages
 * (tree, edit, view, etc.) so they are visible in the settings editor.
 */
const loadPlugins: JupyterFrontEndPlugin<void> = {
  id: '@jupyter-notebook/tree-extension:load-plugins',
  autoStart: true,
  requires: [ISettingRegistry],
  activate(app: JupyterFrontEnd, settingRegistry: ISettingRegistry) {
    const { isDisabled } = PageConfig.Extension;
    const connector = settingRegistry.connector;

    const allPluginsOption = PageConfig.getOption('allPlugins');
    if (!allPluginsOption) {
      return;
    }

    // build the list of plugins shipped by default on the all the notebook pages
    // this avoid explicitly loading `'all'` plugins such as the ones used
    // in JupyterLab only
    const allPlugins = JSON.parse(allPluginsOption);
    const pluginsSet = new Set<string>();
    Object.keys(allPlugins).forEach((key: string) => {
      const extensionsAndPlugins: { [key: string]: boolean | [string] } =
        allPlugins[key];
      Object.keys(extensionsAndPlugins).forEach(plugin => {
        const value = extensionsAndPlugins[plugin];
        if (typeof value === 'boolean' && value) {
          pluginsSet.add(plugin);
        } else if (Array.isArray(value)) {
          value.forEach((v: string) => {
            pluginsSet.add(v);
          });
        }
      });
    });

    app.restored.then(async () => {
      const plugins = await connector.list('all');
      plugins.ids.forEach(async (id: string) => {
        const [extension] = id.split(':');
        // load the plugin if it is built-in the notebook application explicitly
        // either included as an extension or as a plugin directly
        const hasPlugin = pluginsSet.has(extension) || pluginsSet.has(id);
        if (!hasPlugin || isDisabled(id) || id in settingRegistry.plugins) {
          return;
        }
        try {
          await settingRegistry.load(id);
        } catch (error) {
          console.warn(`Settings failed to load for (${id})`, error);
        }
      });
    });
  }
};

/**
 * A plugin to add file browser commands for the tree view.
 */
const openFileBrowser: JupyterFrontEndPlugin<void> = {
  id: '@jupyter-notebook/tree-extension:open-file-browser',
  requires: [INotebookTree, IDefaultFileBrowser],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    notebookTree: INotebookTree,
    browser: IDefaultFileBrowser
  ) => {
    const { commands } = app;
    commands.addCommand(CommandIDs.activate, {
      execute: () => {
        notebookTree.currentWidget = browser;
      }
    });
  }
};

/**
 * A plugin to add the file browser widget to an INotebookShell
 */
const notebookTreeWidget: JupyterFrontEndPlugin<INotebookTree> = {
  id: '@jupyter-notebook/tree-extension:widget',
  requires: [
    IDefaultFileBrowser,
    ITranslator,
    ISettingRegistry,
    IToolbarWidgetRegistry
  ],
  optional: [IRunningSessionManagers, ISettingEditorTracker],
  autoStart: true,
  provides: INotebookTree,
  activate: (
    app: JupyterFrontEnd,
    browser: IDefaultFileBrowser,
    translator: ITranslator,
    settingRegistry: ISettingRegistry,
    toolbarRegistry: IToolbarWidgetRegistry,
    manager: IRunningSessionManagers | null,
    settingEditorTracker: ISettingEditorTracker | null
  ): INotebookTree => {
    const nbTreeWidget = new NotebookTreeWidget();

    const trans = translator.load('notebook');

    browser.title.label = trans.__('Files');
    browser.node.setAttribute('role', 'region');
    browser.node.setAttribute('aria-label', trans.__('File Browser Section'));
    browser.title.icon = folderIcon;

    nbTreeWidget.addWidget(browser);
    nbTreeWidget.tabBar.addTab(browser.title);
    nbTreeWidget.tabsMovable = false;

    // Toolbar
    toolbarRegistry.addFactory(
      FILE_BROWSER_FACTORY,
      'uploader',
      (browser: FileBrowser) =>
        new Uploader({
          model: browser.model,
          translator,
          label: trans.__('Upload')
        })
    );

    toolbarRegistry.addFactory(
      FILE_BROWSER_FACTORY,
      'fileNameSearcher',
      (browser: FileBrowser) => {
        const searcher = FilenameSearcher({
          updateFilter: (
            filterFn: (item: string) => Partial<IScore> | null,
            query?: string
          ) => {
            browser.model.setFilter(value => {
              return filterFn(value.name.toLowerCase());
            });
          },
          useFuzzyFilter: true,
          placeholder: trans.__('Filter files by name'),
          forceRefresh: true
        });
        searcher.addClass(FILTERBOX_CLASS);
        return searcher;
      }
    );

    setToolbar(
      browser,
      createToolbarFactory(
        toolbarRegistry,
        settingRegistry,
        FILE_BROWSER_FACTORY,
        notebookTreeWidget.id,
        translator
      )
    );

    if (manager) {
      const running = new RunningSessions(manager, translator);
      running.id = 'jp-running-sessions-tree';
      running.title.label = trans.__('Running');
      running.title.icon = runningIcon;
      nbTreeWidget.addWidget(running);
      nbTreeWidget.tabBar.addTab(running.title);
    }

    // show checkboxes and file size by default if there is no user setting override
    const settings = settingRegistry.load(FILE_BROWSER_PLUGIN_ID);
    Promise.all([settings, app.restored])
      .then(([settings]) => {
        if (settings.user.showFileCheckboxes === undefined) {
          void settings.set('showFileCheckboxes', true);
        }
        if (settings.user.showFileSizeColumn === undefined) {
          void settings.set('showFileSizeColumn', true);
        }
      })
      .catch((reason: Error) => {
        console.error(reason.message);
      });

    app.shell.add(nbTreeWidget, 'main', { rank: 100 });

    if (settingEditorTracker) {
      settingEditorTracker.widgetAdded.connect((_, editor) => {
        nbTreeWidget.addWidget(editor);
        nbTreeWidget.tabBar.addTab(editor.title);
        nbTreeWidget.currentWidget = editor;
      });
    }

    return nbTreeWidget;
  }
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  createNew,
  loadPlugins,
  openFileBrowser,
  notebookTreeWidget
];
export default plugins;
