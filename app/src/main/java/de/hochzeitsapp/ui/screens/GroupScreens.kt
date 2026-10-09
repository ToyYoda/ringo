package de.hochzeitsapp.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import de.hochzeitsapp.data.Group
import de.hochzeitsapp.ui.AppViewModel
import de.hochzeitsapp.ui.UiState
import de.hochzeitsapp.ui.components.*

/** Gruppen: Jeder kann Gruppen gründen (z. B. Gruppengeschenk, Überraschung) und Gäste einladen. */
@Composable
fun GroupsScreen(ui: UiState, vm: AppViewModel, navigate: (String) -> Unit) {
    var create by remember { mutableStateOf(false) }
    val groups = ui.visibleGroups()
    HeaderPage(
        ui, "Gruppen", "Gemeinsam planen: Gruppengeschenke, Überraschungen, Fahrgemeinschaften …",
        fab = { ExtendedFloatingActionButton(onClick = { create = true }, icon = { Icon(Icons.Default.GroupAdd, null) }, text = { Text("Gruppe") }) },
    ) {
        if (groups.isEmpty()) item { EmptyState(Icons.Default.Diversity3, "Noch keine Gruppen.") }
        items(groups, key = { it.id }) { g ->
            val member = ui.me?.id in g.memberIds
            SectionCard(Modifier.clickable { navigate("group/${g.id}") }, title = g.title, icon = if (g.isGiftGroup) Icons.Default.Redeem else Icons.Default.Groups) {
                if (g.description.isNotBlank()) Text(g.description, style = MaterialTheme.typography.bodyMedium, maxLines = 2)
                Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Pill("${g.memberIds.size} Mitglieder")
                    if (member) Pill("Mitglied", MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.onPrimaryContainer)
                    if (g.hiddenFromCouple) Pill("geheim 🤫")
                }
                if (g.isGiftGroup && g.targetAmount > 0) {
                    LinearProgressIndicator(progress = { (g.collected / g.targetAmount).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                    Text("${formatEuro(g.collected)} von ${formatEuro(g.targetAmount)}", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
    if (create) GroupEditor(ui, vm, Group(title = "", creatorName = ui.myName, creatorId = ui.me?.id, memberIds = listOfNotNull(ui.me?.id))) { id ->
        create = false
        id?.let { navigate("group/$it") }
    }
}

@Composable
fun GroupDetailScreen(ui: UiState, vm: AppViewModel, groupId: String, onBack: () -> Unit) {
    val w = ui.wedding ?: return
    val g = ui.visibleGroups().find { it.id == groupId }
    if (g == null) { NotFound(onBack); return }
    var edit by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var addMembers by remember { mutableStateOf(false) }
    val me = ui.me
    val member = me?.id in g.memberIds
    val canManage = ui.isCouple || (me != null && (g.creatorId == me.id || me.canOrganize))
    val posts = w.posts.filter { it.groupId == g.id }
    val gift = w.gifts.find { it.id == g.giftId }

    HeaderPage(ui, g.title, "eingerichtet von ${g.creatorName}", onBack = onBack) {
        item {
            SectionCard(
                action = if (canManage) ({ IconButton(onClick = { edit = true }) { Icon(Icons.Default.Edit, "Bearbeiten") } }) else null,
                title = "Über die Gruppe", icon = Icons.Default.Info,
            ) {
                Text(g.description.ifBlank { "Keine Beschreibung." }, style = MaterialTheme.typography.bodyMedium)
                if (g.hiddenFromCouple) Text("Für das Brautpaar unsichtbar 🤫", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary, modifier = Modifier.padding(top = 4.dp))
                if (me != null) {
                    Spacer(Modifier.height(8.dp))
                    if (member) OutlinedButton(onClick = { vm.joinGroup(g.id, false) }) { Text("Gruppe verlassen") }
                    else Button(onClick = { vm.joinGroup(g.id, true) }) { Text("Beitreten") }
                }
            }
        }

        if (g.isGiftGroup) item { GiftGroupCard(g, ui, vm, gift?.title) }

        item {
            SectionCard(
                title = "Mitglieder (${g.memberIds.size})", icon = Icons.Default.Groups,
                action = if (member || canManage) ({ IconButton(onClick = { addMembers = true }) { Icon(Icons.Default.PersonAdd, "Gäste einladen") } }) else null,
            ) {
                g.memberIds.mapNotNull { id -> w.guests.find { it.id == id } }.forEach { m ->
                    Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(m.fullName, m.photo, 32.dp)
                        Spacer(Modifier.width(10.dp))
                        Text(m.fullName, Modifier.weight(1f))
                        if (g.isGiftGroup && (canManage || m.id == me?.id)) g.contributions[m.id]?.let { Text(formatEuro(it), fontWeight = FontWeight.SemiBold) }
                    }
                }
            }
        }

        item { SectionTitle("Beiträge") }
        if (member || canManage) item { PostComposer(vm, g.id) }
        else item { Text("Tritt der Gruppe bei, um mitzuschreiben.", Modifier.padding(horizontal = 20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (posts.isEmpty()) item { EmptyState(Icons.Default.Forum, "Noch keine Beiträge in dieser Gruppe.") }
        items(posts, key = { it.id }) { PostCard(it, ui, vm) }
        if (canManage) item {
            TextButton(onClick = { confirmDelete = true }, Modifier.padding(horizontal = 16.dp)) { Text("Gruppe löschen", color = MaterialTheme.colorScheme.error) }
        }
    }

    if (edit) GroupEditor(ui, vm, g) { edit = false }
    if (confirmDelete) ConfirmDialog("Gruppe löschen?", "Die Gruppe und alle Beiträge werden gelöscht.", onConfirm = { vm.deleteGroup(g.id); onBack() }, onDismiss = { confirmDelete = false })
    if (addMembers) {
        FormDialog("Gäste einladen", { addMembers = false }, onSave = { addMembers = false }) {
            w.guests.sortedBy { it.lastName }.forEach { guest ->
                val inGroup = guest.id in g.memberIds
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(inGroup, { on -> vm.saveGroup(g.copy(memberIds = if (on) g.memberIds + guest.id else g.memberIds - guest.id)) })
                    Text(guest.fullName)
                }
            }
        }
    }
}

@Composable
private fun GiftGroupCard(g: Group, ui: UiState, vm: AppViewModel, giftTitle: String?) {
    val mine = ui.me?.id?.let { g.contributions[it] }
    var amount by remember(mine) { mutableStateOf(mine?.let { "%.0f".format(it) } ?: "") }
    SectionCard(title = "Gruppengeschenk", icon = Icons.Default.Redeem) {
        giftTitle?.let { Text("Für: $it", fontWeight = FontWeight.SemiBold) }
        if (g.targetAmount > 0) {
            LinearProgressIndicator(progress = { (g.collected / g.targetAmount).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp))
            Text("${formatEuro(g.collected)} von ${formatEuro(g.targetAmount)} gesammelt", style = MaterialTheme.typography.bodySmall)
        } else Text("${formatEuro(g.collected)} gesammelt", style = MaterialTheme.typography.bodySmall)
        if (g.deadline.isNotBlank()) InfoLine(Icons.Default.Alarm, "Rückmeldung bis: ${g.deadline}")
        if (g.paymentInfo.isNotBlank()) InfoLine(Icons.Default.Payments, "Zahlung: ${g.paymentInfo}")
        if (ui.me != null) {
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    amount, { amount = it.filter { c -> c.isDigit() || c == ',' || c == '.' } },
                    label = { Text("Wie viel gibst du? (€)") }, singleLine = true, modifier = Modifier.weight(1f),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                Spacer(Modifier.width(8.dp))
                Button(onClick = { vm.setContribution(g.id, amount.replace(',', '.').toDoubleOrNull()) }) { Icon(Icons.Default.Check, "Speichern") }
            }
        }
    }
}

/** Calls [onDone] with the group id after saving, or null when cancelled. */
@Composable
private fun GroupEditor(ui: UiState, vm: AppViewModel, g: Group, onDone: (String?) -> Unit) {
    val w = ui.wedding!!
    val isNew = w.groups.none { it.id == g.id }
    var title by remember { mutableStateOf(g.title) }
    var desc by remember { mutableStateOf(g.description) }
    var gift by remember { mutableStateOf(g.isGiftGroup) }
    var giftId by remember { mutableStateOf(g.giftId) }
    var target by remember { mutableStateOf(if (g.targetAmount > 0) "%.0f".format(g.targetAmount) else "") }
    var deadline by remember { mutableStateOf(g.deadline) }
    var payment by remember { mutableStateOf(g.paymentInfo) }
    var hidden by remember { mutableStateOf(g.hiddenFromCouple) }

    FormDialog(if (isNew) "Gruppe einrichten" else "Gruppe bearbeiten", { onDone(null) }, saveEnabled = title.isNotBlank(), onSave = {
        vm.saveGroup(
            g.copy(
                title = title, description = desc, isGiftGroup = gift, giftId = if (gift) giftId else null,
                targetAmount = target.replace(',', '.').toDoubleOrNull() ?: 0.0, deadline = deadline, paymentInfo = payment,
                hiddenFromCouple = hidden && !ui.isCouple,
            )
        )
        onDone(g.id)
    }) {
        Field(title, { title = it }, "Gruppentitel", required = true)
        Field(desc, { desc = it }, "Beschreibung", singleLine = false, minLines = 3)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Switch(gift, { gift = it }); Spacer(Modifier.width(8.dp)); Text("Gruppengeschenk (Geld sammeln)")
        }
        if (gift) {
            Picker("Wunsch von der Geschenkeliste", listOf<String?>(null) + w.gifts.map { it.id }, giftId, { id -> w.gifts.find { it.id == id }?.title ?: "– eigenes Geschenk –" }, { giftId = it })
            Field(target, { target = it }, "Zielbetrag (€)", keyboard = KeyboardType.Decimal)
            Field(deadline, { deadline = it }, "Rückmeldung bis", placeholder = "TT.MM.JJJJ")
            Field(payment, { payment = it }, "Zahlungsinfos", singleLine = false, minLines = 2)
        }
        if (!ui.isCouple) Row(verticalAlignment = Alignment.CenterVertically) {
            Switch(hidden, { hidden = it }); Spacer(Modifier.width(8.dp))
            Column { Text("Vor dem Brautpaar verbergen"); Text("Für Überraschungen", style = MaterialTheme.typography.bodySmall) }
        }
    }
}
