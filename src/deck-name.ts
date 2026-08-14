const ENCODED_SPACE = /--/g;
const ENCODED_COLON = /_/g;

export function decodeDeckTag(tag: string): string {
  return tag
    .split('/')
    .map((segment) =>
      segment
        .replace(ENCODED_SPACE, ' ')
        .replace(ENCODED_COLON, ':')
    )
    .join('::');
}
