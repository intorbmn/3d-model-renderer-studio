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

Usage (Blender 4.x or 5.x):
    blender --background character.blend --python export_kkbp_glb.py -- output.glb [--no-outfit]

Only use this on characters you are allowed to use; the result contains the game's assets.
"""

import re
import sys

import bpy

SKIP_OBJECTS = re.compile(r"^(WGT-|Widget|Facecard-|Face card|Gag Eyes|Tears|Tongue|.* Grid$)")
ALPHA_MATERIALS = re.compile(r"eyelash|mayuge|hitomi|eyelid|namida|eyeline|hair|kage|tooth", re.I)


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not argv:
        sys.exit("usage: blender --background file.blend --python export_kkbp_glb.py -- output.glb [--no-outfit]")
    return argv[0], "--no-outfit" in argv


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
    if ALPHA_MATERIALS.search(material.name):
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
    its nearest deform ancestor, or, when there is none, to where the metarig puts it.
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
    weight_targets = {}
    for bone in edit:
        if bone.use_deform:
            continue
        target = f"DEF-{bone.name}" if f"DEF-{bone.name}" in deform else None
        p = bone.parent
        while target is None and p is not None:
            target = p.name if p.use_deform else None
            p = p.parent
        if target:
            weight_targets[bone.name] = target
    for obj in bpy.data.objects:
        if obj.type == "MESH" and any(m.type == "ARMATURE" and m.object is rig for m in obj.modifiers):
            move_weights(obj, weight_targets)

    parents = {}
    for bone in edit:
        if not bone.use_deform:
            continue
        p = bone.parent
        while p is not None and not p.use_deform:
            p = p.parent
        target = p.name if p is not None else None
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
    output, no_outfit = args()
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
        if no_outfit and obj.name.startswith("Outfit"):
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

    print(f"meshes: {[m.name for m in meshes]}; bones: {len(arm.data.bones)}")

    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes + [arm]:
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


main()
