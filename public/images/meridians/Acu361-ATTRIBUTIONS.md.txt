# Attributions

## Licenses of this package

| Part | License | File |
|---|---|---|
| Data: `data/`, `schema/` | Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0) | `LICENSE` |
| Code: `scripts/` (and `site/`, when added) | MIT | `LICENSE-CODE` |

The data are an adaptation of Z-Anatomy and are shared under the same license as Z-Anatomy, CC BY-SA 4.0.

## Anatomical model

The body in `data/body/` comes from Z-Anatomy, which is based on BodyParts3D. All coordinates in this package are defined on that body. As requested by Z-Anatomy, the models are attributed as follows:

- "Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0"
- "BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan"

Z-Anatomy: Gauthier Kervyn (design, 3D, anatomy), Marcin Zielinski (Python script) and contributors; <https://github.com/Z-Anatomy/Models-of-human-anatomy>.

BodyParts3D: The Database Center for Life Science; original model by Kousaku Okubo; <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html>. Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. BodyParts3D: 3D structure database for anatomical concepts. *Nucleic Acids Research* 37 (Database issue): D782-D785, 2009. doi:10.1093/nar/gkn613.

### Changes made

The GLB files in `data/body/` were produced from the Z-Anatomy Blender template (`Startup.blend`), read in Blender 5.1.0 without saving it. The following changes were made to the upstream meshes:

1. **Selection.** Objects were taken from the Z-Anatomy collections *1: Skeletal system*, *3: Joints*, *4: Muscular system*, *5: Cardiovascular system*, *6: Lymphoid organs*, *7: Nervous system & Sense organs* and *8: Visceral systems*, and, for the skin, *9: Regions of human body*. Not used: the collection *2: Muscular insertions*; Z-Anatomy's label, text and helper objects (names ending in `.j`, `.g`, `.el`, `.ol`, `.s`, `.t`, `.e` or `.o`, or beginning with `(` or `[`); objects with fewer than 4 faces; hair and eyelashes. Each object was used once. Result: 2,811 objects plus the skin.
2. **Evaluation.** Each object was taken as Blender evaluates it, with Z-Anatomy's own modifiers applied (for example subdivision surfaces), except Solidify and Boolean modifiers, which were switched off. Curve objects (many vessels and nerves) were converted to tube meshes with their own bevel settings. All faces were triangulated.
3. **Layers.** Objects were grouped into seven files: `bone` = Skeletal system without its cartilages; `ligament` = Joints plus the cartilages of the Skeletal system; `muscle` = Muscular system; `vessel` = Cardiovascular system without the heart; `organ` = Visceral systems, Lymphoid organs and the heart (the objects under Z-Anatomy's *Heart* group); `nerve` = Nervous system & Sense organs (including the brain and sense organs); `skin`.
4. **Decimation.** Meshes were simplified with Blender's Decimate modifier (collapse) to a vertex budget per layer, keeping at least 80 faces per object: ligament 201,369 to 70,317 vertices; muscle 1,149,608 to 384,877; organ 362,684 to 143,956; vessel 1,875,667 to 111,771; nerve 1,178,569 to 237,152. Bone (291,940 vertices) and skin were not decimated.
5. **Skin.** The skin-region objects were merged into one mesh named `Skin`; coincident vertices were welded (tolerance 0.0001 mm) and unused vertices removed (28,271 vertices, 50,876 triangles). Z-Anatomy's division of the skin into body regions is not kept.
6. **Units and axes.** Metres were converted to millimetres and Blender axes (Z up, -Y anterior) to glTF axes (+Y up, +Z anterior): (x, y, z) in the GLB = 1000 x (x, z, -y) in Blender. No other scaling, translation, deformation or change of posture was applied.
7. **Orientation and normals.** Triangle winding was flipped per object where needed so that its signed volume is positive (outward-facing for closed meshes), and per-vertex normals were recomputed. Positions and normals are stored as 32-bit floats.
8. **Format.** Each object was written as one glTF node with one mesh (positions, normals, 32-bit indices), without materials, textures or hierarchy. Node names are the Z-Anatomy object names; `extras.group_en` holds the name of the object's parent in the Z-Anatomy hierarchy. The JSON chunk of each file carries an attribution in `asset.copyright`.

Acu361 adds no geometry to these files. Acupoints, meridian lines and rulers are separate JSON files (`data/points.json`, `data/meridians.json`, `data/rulers.json`) whose coordinates refer to this body.

## Acupoint nomenclature and proportional measurements

Point codes, the set of 361 points, their order and the meridian names follow:

World Health Organization Regional Office for the Western Pacific. *WHO Standard Acupuncture Point Locations in the Western Pacific Region*. Manila: WHO Regional Office for the Western Pacific; 2008. ISBN 978-92-9061-248-7.

The rulers in `data/rulers.json` give the proportional bone (skeletal) measurements in B-cun of the same publication (pp. 12-13). These are used as factual references; no text of the standard is reproduced in this package. The position of every point on this body was determined by consensus of a panel of seven acupuncturists; the package does not contain the location descriptions of the standard.

The note of one ruler (`head_glabella_ant_hairline`) cites the note on Yintang in GB/T 12346-2021, *Nomenclature and location of meridian points* (经穴名称与定位), for how the glabella is taken; no text of that standard is reproduced.

## Meridian lines

The lines in `data/meridians.json` were computed by the authors on the skin of this body through the points of `data/points.json`. The order in which points are joined follows the body-surface course shown in standard meridian charts and the point order of WHO 2008.
