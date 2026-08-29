/**
 * The ids the sources view is contributed under. They live here rather than
 * beside the view itself so the panel can focus the view without importing it,
 * which would close a cycle through the provider.
 *
 * These must match the `viewsContainers` and `views` entries in package.json.
 */
export const SOURCES_CONTAINER_ID = 'jsonataPlayground';
export const SOURCES_VIEW_ID = 'jsonataPlaygroundSources';

/** VS Code derives this command from the container id */
export const SOURCES_CONTAINER_FOCUS = `workbench.view.extension.${SOURCES_CONTAINER_ID}`;

/** Set while a playground is open, which is the only time the view means anything */
export const PLAYGROUND_OPEN_CONTEXT = 'jsonataValidator.playgroundOpen';
