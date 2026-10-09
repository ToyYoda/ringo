package de.hochzeitsapp.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import de.hochzeitsapp.data.ProgramItem
import de.hochzeitsapp.data.ProgramStatus
import de.hochzeitsapp.ui.AppViewModel
import de.hochzeitsapp.ui.UiState
import de.hochzeitsapp.ui.components.*
import de.hochzeitsapp.ui.theme.Success

/**
 * Abendplanung: für jeden Termin ein Zeitplan, wer wann einen Programmpunkt macht.
 * Gäste melden Programmpunkte an, Brautpaar/Trauzeugen bestätigen sie.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProgramScreen(ui: UiState, vm: AppViewModel) {
    val w = ui.wedding ?: return
    val events = ui.visibleEvents().sortedBy { dateKey(it.date, it.time) }
    var selectedId by rememberSaveable(events.size) { mutableStateOf(events.maxByOrNull { e -> w.program.count { it.eventId == e.id } }?.id) }
    var edit by remember { mutableStateOf<ProgramItem?>(null) }
    val items = ui.visibleProgram().filter { it.eventId == selectedId }.sortedBy { it.time }

    HeaderPage(
        ui, "Programm", "Ablauf & Programmpunkte. Ihr wollt etwas beitragen? Meldet es an!",
        fab = if (selectedId != null) ({
            ExtendedFloatingActionButton(
                onClick = { edit = ProgramItem(eventId = selectedId!!, title = "", host = if (ui.isCouple) "Brautpaar" else ui.myName, hostGuestId = ui.me?.id) },
                icon = { Icon(Icons.Default.Add, null) },
                text = { Text(if (ui.canOrganize) "Programmpunkt" else "Anmelden") },
            )
        }) else null,
    ) {
        if (events.isEmpty()) {
            item { EmptyState(Icons.Default.EventNote, "Noch keine Termine angelegt.") }
            return@HeaderPage
        }
        item {
            ScrollableTabRow(
                selectedTabIndex = events.indexOfFirst { it.id == selectedId }.coerceAtLeast(0),
                edgePadding = 16.dp,
                containerColor = MaterialTheme.colorScheme.background,
            ) {
                events.forEach { e ->
                    Tab(selected = e.id == selectedId, onClick = { selectedId = e.id }, text = { Text(e.title, maxLines = 1) })
                }
            }
        }
        if (items.isEmpty()) item { EmptyState(Icons.Default.Celebration, "Noch keine Programmpunkte für diesen Termin.") }
        items(items, key = { it.id }) { p ->
            ProgramRow(p, ui, onEdit = { edit = p }, onStatus = { vm.setProgramStatus(p.id, it) })
        }
        if (ui.canOrganize && !ui.isCouple) {
            item {
                Text(
                    "Als Organisator/in siehst du auch Überraschungen 🤫 – diese sind für das Brautpaar ausgeblendet.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(20.dp),
                )
            }
        }
    }

    edit?.let { p ->
        val isNew = w.program.none { it.id == p.id }
        var title by remember(p) { mutableStateOf(p.title) }
        var time by remember(p) { mutableStateOf(p.time) }
        var duration by remember(p) { mutableStateOf(p.durationMin.toString()) }
        var host by remember(p) { mutableStateOf(p.host) }
        var notes by remember(p) { mutableStateOf(p.notes) }
        var req by remember(p) { mutableStateOf(p.requirements) }
        var surprise by remember(p) { mutableStateOf(p.surprise) }
        FormDialog(if (isNew) "Programmpunkt anmelden" else "Programmpunkt bearbeiten", { edit = null }, saveEnabled = title.isNotBlank(), onSave = {
            vm.saveProgramItem(p.copy(title = title, time = time, durationMin = duration.toIntOrNull() ?: 15, host = host, notes = notes, requirements = req, surprise = surprise))
            edit = null
        }) {
            Field(title, { title = it }, "Was?", required = true, placeholder = "z. B. Rede des Trauzeugen")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Field(time, { time = it }, "Wann?", Modifier.weight(1f), placeholder = "HH:MM")
                Field(duration, { duration = it.filter(Char::isDigit) }, "Dauer (Min.)", Modifier.weight(1f), keyboard = KeyboardType.Number)
            }
            Field(host, { host = it }, "Wer?")
            Field(notes, { notes = it }, "Beschreibung", singleLine = false, minLines = 2)
            Field(req, { req = it }, "Hinweise an den Veranstalter", placeholder = "Beamer, Mikrofon, Musik …")
            if (!ui.isCouple) Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(surprise, { surprise = it })
                Column {
                    Text("Überraschung")
                    Text("Nur für Trauzeugen & Organisatoren sichtbar", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (isNew && !ui.canOrganize) Text("Dein Programmpunkt wird nach Bestätigung im Ablauf für alle sichtbar.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
            if (!isNew && (ui.canOrganize || p.hostGuestId == ui.me?.id)) {
                TextButton(onClick = { vm.deleteProgramItem(p.id); edit = null }) { Text("Programmpunkt löschen", color = MaterialTheme.colorScheme.error) }
            }
        }
    }
}

@Composable
private fun ProgramRow(p: ProgramItem, ui: UiState, onEdit: () -> Unit, onStatus: (ProgramStatus) -> Unit) {
    val mine = p.hostGuestId != null && p.hostGuestId == ui.me?.id
    Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
        Column(Modifier.width(56.dp).padding(top = 14.dp), horizontalAlignment = Alignment.End) {
            Text(p.time.ifBlank { "–" }, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Text("${p.durationMin} min", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        ElevatedCard(Modifier.weight(1f).padding(start = 10.dp)) {
            Column(Modifier.padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(p.title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                    if (ui.canOrganize || mine) IconButton(onClick = onEdit, Modifier.size(32.dp)) { Icon(Icons.Default.Edit, "Bearbeiten", Modifier.size(18.dp)) }
                }
                if (p.host.isNotBlank()) Text(p.host, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (p.notes.isNotBlank()) Text(p.notes, style = MaterialTheme.typography.bodySmall)
                if (p.requirements.isNotBlank() && (ui.canOrganize || mine)) Text("Technik/Hinweise: ${p.requirements}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (p.surprise) Pill("Überraschung 🤫")
                    when (p.status) {
                        ProgramStatus.CONFIRMED -> if (ui.canOrganize || mine) Pill("Bestätigt", Success.copy(alpha = 0.15f), Success)
                        ProgramStatus.DECLINED -> Pill("Abgelehnt", MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer)
                        ProgramStatus.REQUESTED -> Pill("Angefragt", MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.onPrimaryContainer)
                    }
                }
                if (ui.canOrganize && p.status == ProgramStatus.REQUESTED) {
                    Row(Modifier.padding(top = 4.dp)) {
                        TextButton(onClick = { onStatus(ProgramStatus.CONFIRMED) }) { Text("Bestätigen") }
                        TextButton(onClick = { onStatus(ProgramStatus.DECLINED) }) { Text("Ablehnen", color = MaterialTheme.colorScheme.error) }
                    }
                }
            }
        }
    }
}
