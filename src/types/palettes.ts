/**
 * Colour as data. Pictures are never painted in fixed colours: every part of a creature, tree,
 * rock or prop names a colour *region* ('coat', 'bark', 'hoop'), and the region is filled from a
 * palette when the thing is drawn. So one painted shape can be a grey wolf, a brown wolf or a
 * pale wolf, and two oaks grown the same way still wear different greens.
 *
 * A colour choice is one of:
 * - '#rrggbb'   exactly this colour;
 * - '@palette'  any colour from that palette (content/palettes.ts), nudged by its drift, so no
 *               two picks need ever be quite the same.
 */
export type PaletteId = string;

export interface PaletteDef {
  /** Starting colours ('#rrggbb'). A pick starts from one of them. */
  swatches: readonly string[];
  /**
   * How far a pick may wander from its swatch: hue in degrees, saturation and lightness as shares
   * (0.1 = up to 10% either way). Leave out for picks that are exactly a swatch.
   */
  drift?: { readonly hue?: number; readonly sat?: number; readonly light?: number };
}
