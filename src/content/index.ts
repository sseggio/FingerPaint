/**
 * Static content manifest. Metro bundles JSON imports, so every artwork must be listed
 * here (content.test.ts fails if a file under artworks/ is missing from this list).
 * Data is exposed as `unknown` on purpose: the registry validates it before use.
 */
import albums from './albums.json';
import tabbyCat from './artworks/animals/tabby-cat.json';
import happyMushroom from './artworks/garden/happy-mushroom.json';
import pottedCactus from './artworks/garden/potted-cactus.json';
import strawberry from './artworks/kitchen/strawberry.json';
import tropicalFish from './artworks/ocean/tropical-fish.json';
import littleRocket from './artworks/space/little-rocket.json';

export const albumsData: unknown = albums;

export const artworkData: readonly unknown[] = [
  pottedCactus,
  happyMushroom,
  tropicalFish,
  strawberry,
  tabbyCat,
  littleRocket,
];
