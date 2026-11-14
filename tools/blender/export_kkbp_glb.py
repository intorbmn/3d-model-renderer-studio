"""Export a character made with KKBP (the Koikatsu / ILLGAMES Blender plugin) as a GLB for
3D Model Renderer Studio.

The GLB keeps what the studio's character maker works with:
  * the shape bones (cf_s_* for the body, cf_J_* for the face) with their full hierarchy, which the
    maker scales and moves like the games' own character makers do;
  * each mesh as its own part (body, outfit/hair, ...), which the maker can show or hide;
  * the expression shape keys;
  * the hair, skirt and bust bones, which the studio turns into physics groups.

KKBP builds a Rigify control rig and moves the mesh weights onto its DEF- bones. This script keeps
only the deform bones of that rig and drops the DEF- prefix, so the GLB has one clean skeleton with
KKBP's bone names (Hips, Spine, Left arm, ...) that the mod recognises, in the rig's true rest pose.

Three ways to use it (Blender 4.x or 5.x):

  * As an add-on: Edit > Preferences > Add-ons > Install from Disk, pick this file and enable it.
    Then File > Export > "Body + outfit for 3D Model Renderer Studio" (or the Studio tab of the
    3D view's sidebar) writes <name>_body.glb and <name>_outfitNN.glb next to the saved .blend.
  * On Windows, drag .blend files onto kkbp_to_studio.bat (kept next to this file).
  * From the command line:
        blender --background character.blend --python export_kkbp_glb.py -- output.glb [--no-outfit | --only-outfit]

--no-outfit leaves the clothes and hair out (the body, with its face); --only-outfit writes just
them, an outfit to import in the studio's Outfit tab (--outfit N: only "Outfit N"). With --split,
`output` is a base name: it writes <base>_body.glb and one <base>_outfitNN.glb per outfit (KKBP's
"Export all outfits" gives several; identical ones are written once). The add-on and the .bat use
--split.

Only use this on characters you are allowed to use; the result contains the game's assets.
"""

import os
import re
import subprocess
import sys

import bpy

bl_info = {
    "name": "3D Model Renderer Studio: KKBP body + outfit export",
    "author": "3D Model Renderer Studio",
    "version": (1, 1, 0),
    "blender": (4, 2, 0),
    "location": "File > Export, 3D View > Sidebar > Studio",
    "description": "Writes a KKBP character as body.glb and outfit.glb for 3D Model Renderer Studio",
    "category": "Import-Export",
}

SKIP_OBJECTS = re.compile(r"^(WGT-|Widget|Facecard-|Face card|Gag Eyes|Tears|Tongue|.* Grid$)")
ALPHA_MATERIALS = re.compile(r"eyelash|mayuge|hitomi|eyelid|namida|eyeline|hair|kage|tooth", re.I)


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not argv:
        sys.exit("usage: blender --background file.blend --python export_kkbp_glb.py -- "
                 "output.glb [--no-outfit | --only-outfit | --outfit N]  or  -- base --split")
    outfit = None
    if "--outfit" in argv and argv.index("--outfit") + 1 < len(argv):
        outfit = int(argv[argv.index("--outfit") + 1])
    return argv[0], "--no-outfit" in argv, "--only-outfit" in argv, outfit, "--split" in argv


def find_armatures():
    rigify = next((o for o in bpy.data.objects if o.type == "ARMATURE" and "rig_ui" in o.keys()), None)
    meta = next((o for o in bpy.data.objects if o.type == "ARMATURE" and o.name.startswith("Metarig")), None)
    if meta is None:
        meta = next((o for o in bpy.data.objects if o.type == "ARMATURE" and o is not rigify), rigify)
    return rigify, meta


def base_bone_name(group_name):
    """DEF-Left arm.002 -> Left arm (Rigify prefixes deform bones and splits twist segments)."""
    name = group_name[4:] if group_name.startswith("DEF-") else group_name
    return re.sub(r"\.\d{3}$", "", name)


def rebind(mesh, meta):
    """Moves the weights of `mesh` onto `meta`'s bones and binds it to `meta`."""
    bones = meta.data.bones
    groups = {g.index: g.name for g in mesh.vertex_groups}
    targets = {}
    for vertex in mesh.data.vertices:
        merged = {}
        for g in vertex.groups:
            name = base_bone_name(groups[g.group])
            if g.weight > 0 and name in bones:
                merged[name] = merged.get(name, 0.0) + g.weight
        for name, weight in merged.items():
            targets.setdefault(name, []).append((vertex.index, weight))
    for g in list(mesh.vertex_groups):
        mesh.vertex_groups.remove(g)
    for name, entries in targets.items():
        group = mesh.vertex_groups.new(name=name)
        for index, weight in entries:
            group.add([index], min(weight, 1.0), "REPLACE")
    for modifier in list(mesh.modifiers):
        if modifier.type == "ARMATURE":
            modifier.object = meta
        elif modifier.type in {"SOLIDIFY", "UV_WARP", "SUBSURF"}:
            mesh.modifiers.remove(modifier)  # outlines and eye UV tricks are not exported
    world = mesh.matrix_world.copy()
    mesh.parent = meta
    mesh.matrix_world = world
    return set(targets)


def mark_deform(meta, weighted):
    """Weighted bones and all their ancestors deform, so the shape-bone hierarchy survives."""
    keep = set()
    for name in weighted:
        bone = meta.data.bones.get(name)
        while bone is not None and bone.name not in keep:
            keep.add(bone.name)
            bone = bone.parent
    for bone in meta.data.bones:
        bone.use_deform = bone.name in keep
    return keep


def find_image(material):
    """KKBP bakes each material's lit colour into "<material>_light.png"."""
    base = material.name[4:] if material.name.startswith("SVS ") else material.name
    base = re.sub(r"\.\d{3}$", "", base)
    for name in (f"{base}_light.png", f"{base}.png"):
        if name in bpy.data.images:
            return bpy.data.images[name]
    return None


def has_cutout(image):
    """True when the texture's alpha cuts parts away (a bra's lace, a frayed hem): over 1% of it
    is below one half. KKBP's clothes rely on that alpha; without a cutoff it renders black."""
    try:
        import numpy as np

        if image.channels < 4 or len(image.pixels) == 0:
            return False
        pixels = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(pixels)
        return float((pixels[3::4] < 0.5).mean()) > 0.01
    except Exception:  # an image Blender cannot read: keep it opaque
        return False


def simplify_material(material):
    image = find_image(material)
    if image is None or material.name.startswith("Outline "):
        return
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.8
    if ALPHA_MATERIALS.search(material.name) or has_cutout(image):
        # Alpha clip (glTF MASK): a "greater than 0.5" node is what the exporter reads as a cutoff.
        clip = nodes.new("ShaderNodeMath")
        clip.operation = "GREATER_THAN"
        clip.inputs[1].default_value = 0.5
        links.new(tex.outputs["Alpha"], clip.inputs[0])
        links.new(clip.outputs[0], bsdf.inputs["Alpha"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])


def move_weights(mesh, targets):
    """Adds the weights of each group named in `targets` to the target group and removes it."""
    groups = {g.name: g for g in mesh.vertex_groups}
    moves = {g.index: targets[g.name] for g in mesh.vertex_groups if g.name in targets}
    if not moves:
        return
    for name in set(moves.values()):
        if name not in groups:
            groups[name] = mesh.vertex_groups.new(name=name)
    for vertex in mesh.data.vertices:
        for g in vertex.groups:
            if g.group in moves and g.weight > 0:
                groups[moves[g.group]].add([vertex.index], g.weight, "ADD")
    for index in sorted(moves, reverse=True):
        mesh.vertex_groups.remove(mesh.vertex_groups[index])


def strip_rigify(rig, meta):
    """Keeps only the deform bones of a Rigify rig and drops the DEF- prefix (bones and weights).

    Rigify parents its deform bones to control (ORG-/MCH-) bones; each kept bone is reparented to
    the deform bone that moves like its nearest such ancestor (ORG-Left arm -> DEF-Left arm), or,
    when there is none, to where the metarig puts it.
    """
    bpy.ops.object.select_all(action="DESELECT")
    rig.hide_set(False)
    rig.hide_viewport = False
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    edit = rig.data.edit_bones
    deform = {b.name for b in edit if b.use_deform}

    def rig_name(plain):
        for candidate in (f"DEF-{plain}", plain):
            if candidate in deform:
                return candidate
        return None

    # Weights on control bones (KKBP leaves some on "Left shoulder", "cf_j_siri_L", ...) would be
    # lost with those bones: move them to the matching DEF- bone or the nearest deform ancestor.
    def deform_of(bone):
        """The deform bone that moves like `bone`: itself, its DEF- twin (also for ORG-/MCH- bones)."""
        if bone.use_deform:
            return bone.name
        plain = re.sub(r"^(ORG|MCH)-", "", bone.name)
        return f"DEF-{plain}" if f"DEF-{plain}" in deform else None

    def nearest_deform(bone):
        """`bone` or its nearest ancestor that has a deform bone moving like it."""
        while bone is not None:
            target = deform_of(bone)
            if target:
                return target
            bone = bone.parent
        return None

    weight_targets = {}
    for bone in edit:
        if bone.use_deform:
            continue
        target = nearest_deform(bone)
        if target:
            weight_targets[bone.name] = target
    for obj in bpy.data.objects:
        if obj.type == "MESH" and any(m.type == "ARMATURE" and m.object is rig for m in obj.modifiers):
            move_weights(obj, weight_targets)

    parents = {}
    for bone in edit:
        if not bone.use_deform:
            continue
        # KKBP hangs the games' helper bones (cf_s_elbo_L, cf_d_arm01_L, cf_d_forearm02_L, ...)
        # from Rigify's ORG- bones; they must follow the matching DEF- bone, not the chest.
        target = nearest_deform(bone.parent)
        if target == bone.name:
            target = None
        if target is None and meta is not None:
            m = meta.data.bones.get(base_bone_name(bone.name))
            m = m.parent if m is not None else None
            while m is not None and target is None:
                target = rig_name(m.name)
                m = m.parent
        parents[bone.name] = target
    for bone in [b for b in edit if not b.use_deform]:
        edit.remove(bone)
    for name, target in parents.items():
        bone = edit.get(name)
        if bone is not None:
            bone.use_connect = False
            bone.parent = edit.get(target) if target else None
    renames = {}
    for bone in edit:
        if bone.name.startswith("DEF-"):
            plain = bone.name[4:]
            if plain not in edit:
                renames[bone.name] = plain
    for old, new in renames.items():
        edit[old].name = new
    bpy.ops.object.mode_set(mode="OBJECT")
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for old, new in renames.items():
            group = obj.vertex_groups.get(old)
            if group is None:
                continue
            # A leftover group with the plain name (from the PMX import) belongs to no bone now; it
            # would make Blender rename ours to "Left wrist.001" and lose the weights.
            stale = obj.vertex_groups.get(new)
            if stale is not None:
                obj.vertex_groups.remove(stale)
            group.name = new
    for constraint_holder in rig.pose.bones:
        for c in list(constraint_holder.constraints):
            constraint_holder.constraints.remove(c)
    rig.animation_data_clear()
    rig.data.animation_data_clear()
    return set(renames.values())


def main():
    output, no_outfit, only_outfit, outfit, split = args()
    if split:
        split_export(output)
    else:
        export(output, no_outfit, only_outfit, outfit)


def prepare():
    """Strips the rig and simplifies the materials once. Returns (armature, [character meshes])."""
    rigify, meta = find_armatures()
    # Rigify keeps the true rest pose of every deform bone (KKBP adjusts hair and accessory bones
    # after building the metarig), so the export uses the generated rig, stripped to its deform bones.
    arm = rigify or meta
    if arm is None:
        sys.exit("no armature found")
    if rigify is not None:
        strip_rigify(rigify, meta)
    arm.data.pose_position = "REST"
    arm.hide_set(False)
    arm.hide_viewport = False

    meshes = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or SKIP_OBJECTS.match(obj.name):
            continue
        if not any(m.type == "ARMATURE" and m.object is arm for m in obj.modifiers):
            continue
        for modifier in list(obj.modifiers):
            if modifier.type in {"SOLIDIFY", "UV_WARP", "SUBSURF"}:
                obj.modifiers.remove(modifier)  # outlines and eye UV tricks are not exported
        for slot in obj.material_slots:
            if slot.material:
                simplify_material(slot.material)
        # Part names the studio shows: "Body", "Outfit 00", ... (without the character's name).
        name = arm.get("name") or (meta.get("name") if meta else None)
        if name and obj.name.endswith(" " + name):
            obj.name = obj.name[: -len(name) - 1]
        meshes.append(obj)
    return arm, meshes


def write_glb(output, arm, meshes):
    print(f"meshes: {[m.name for m in meshes]}; bones: {len(arm.data.bones)}")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes + [arm]:
        # KKBP keeps the other outfits in collections left out of the view layer.
        if obj.name not in bpy.context.view_layer.objects:
            bpy.context.scene.collection.objects.link(obj)
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_def_bones=True,
        export_morph=True,
        export_morph_normal=False,
        export_try_sparse_sk=True,
        export_animations=False,
        export_image_format="AUTO",
    )
    print(f"written {output}")


def is_outfit(obj):
    return obj.name.startswith("Outfit")


def outfit_number(obj):
    match = re.match(r"Outfit (\d+)", obj.name)
    return int(match.group(1)) if match else None


def export(output, no_outfit=False, only_outfit=False, outfit=None):
    """Exports the open (KKBP) file. Changes the scene: run it on a file you do not save afterwards."""
    arm, meshes = prepare()
    if no_outfit:
        meshes = [m for m in meshes if not is_outfit(m)]
    if only_outfit or outfit is not None:
        meshes = [m for m in meshes if is_outfit(m) and (outfit is None or outfit_number(m) == outfit)]
    if not meshes:
        sys.exit("nothing to export")
    write_glb(output, arm, meshes)


def outfit_signature(obj):
    """What an outfit wears, by material name without KKBP's numbers (copies look the same)."""
    return tuple(sorted({re.sub(r"(\.\d{3}|\s\d+)+$", "", s.material.name) for s in obj.material_slots
                         if s.material and not s.material.name.startswith("Outline ")}))


def split_export(base):
    """Writes <base>_body.glb and one <base>_outfitNN.glb per different outfit. Returns the paths."""
    arm, meshes = prepare()
    outputs = []
    body = [m for m in meshes if not is_outfit(m)]
    if body:
        outputs.append(base + "_body.glb")
        write_glb(outputs[-1], arm, body)
    seen = {}
    for obj in sorted((m for m in meshes if is_outfit(m)), key=lambda m: m.name):
        signature = outfit_signature(obj)
        if signature in seen:
            print(f"skipped {obj.name}: the same as {seen[signature]}")
            continue
        seen[signature] = obj.name
        number = outfit_number(obj)
        outputs.append(f"{base}_outfit{number:02d}.glb" if number is not None else f"{base}_outfit.glb")
        write_glb(outputs[-1], arm, [obj])
    return outputs


# ---------- Blender add-on: one click writes the files, from a separate Blender process, so the
# open scene is not changed.


def export_both(blend_path, blender=None, script=None):
    """Writes <name>_body.glb and <name>_outfitNN.glb next to `blend_path`. Returns their paths."""
    blender = blender or bpy.app.binary_path
    script = script or os.path.abspath(__file__)
    base = os.path.splitext(blend_path)[0]
    result = subprocess.run(
        [blender, "--background", blend_path, "--python", script, "--", base, "--split"],
        capture_output=True, text=True,
    )
    outputs = re.findall(r"^written (.+\.glb)$", result.stdout, re.M)
    if result.returncode != 0 or not outputs:
        log = (result.stdout + result.stderr).strip().splitlines()[-15:]
        raise RuntimeError("export failed:\n" + "\n".join(log))
    return outputs


class STUDIO_OT_export_kkbp(bpy.types.Operator):
    """Write this KKBP character as <name>_body.glb and <name>_outfit.glb for 3D Model Renderer Studio"""

    bl_idname = "export_scene.studio_kkbp"
    bl_label = "Body + outfit for 3D Model Renderer Studio"

    def execute(self, context):
        if not bpy.data.filepath:
            self.report({"ERROR"}, "Save the .blend file first (File > Save)")
            return {"CANCELLED"}
        if bpy.data.is_dirty:
            bpy.ops.wm.save_mainfile()
        context.window.cursor_set("WAIT")
        try:
            outputs = export_both(bpy.data.filepath)
        except Exception as error:  # shown to the user, whatever went wrong
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}
        finally:
            context.window.cursor_set("DEFAULT")
        self.report({"INFO"}, "Written " + ", ".join(os.path.basename(o) for o in outputs))
        return {"FINISHED"}


class STUDIO_PT_panel(bpy.types.Panel):
    bl_label = "3D Model Renderer Studio"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Studio"

    def draw(self, context):
        layout = self.layout
        layout.label(text="KKBP character to GLB")
        layout.operator(STUDIO_OT_export_kkbp.bl_idname, text="Export body + outfit", icon="EXPORT")
        layout.label(text="Files go next to the .blend")


def menu_entry(self, context):
    self.layout.operator(STUDIO_OT_export_kkbp.bl_idname, text="Body + outfit for 3D Model Renderer Studio (.glb)")


def register():
    bpy.utils.register_class(STUDIO_OT_export_kkbp)
    bpy.utils.register_class(STUDIO_PT_panel)
    bpy.types.TOPBAR_MT_file_export.append(menu_entry)


def unregister():
    bpy.types.TOPBAR_MT_file_export.remove(menu_entry)
    bpy.utils.unregister_class(STUDIO_PT_panel)
    bpy.utils.unregister_class(STUDIO_OT_export_kkbp)


if __name__ == "__main__" and "--" in sys.argv:
    main()
