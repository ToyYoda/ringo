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
import androidx.compose.ui.unit.dp
import de.hochzeitsapp.data.Rsvp
import de.hochzeitsapp.data.WeddingEvent
import de.hochzeitsapp.ui.AppViewModel
import de.hochzeitsapp.ui.UiState
import de.hochzeitsapp.ui.components.*
import de.hochzeitsapp.ui.theme.Success

/** Terminliste: alle Ereignisse, verknüpft mit der Gästeliste (Einladungen, Zu- und Absagen). */
@Composable
fun EventsScreen(ui: UiState, vm: AppViewModel) {
    val w = ui.wedding ?: return
    var edit by remember { mutableStateOf<WeddingEvent?>(null) }
    var invitations by remember { mutableStateOf<WeddingEvent?>(null) }
    val events = ui.visibleEvents().sortedBy { dateKey(it.date, it.time) }

    HeaderPage(
        ui, "Termine", if (ui.isCouple) "Wer ist wozu eingeladen, wer hat zugesagt?" else "Deine Termine rund um die Hochzeit",
        fab = if (ui.isCouple) ({
            ExtendedFloatingActionButton(onClick = { edit = WeddingEvent(title = "", date = "") }, icon = { Icon(Icons.Default.Add, null) }, text = { Text("Termin") })
        }) else null,
    ) {
        if (events.isEmpty()) item { EmptyState(Icons.Default.EventBusy, if (ui.isCouple) "Noch keine Termine. Legt Trauung, Feier, Polterabend … an." else "Du bist noch zu keinem Termin eingeladen.") }
        items(events, key = { it.id }) { e ->
            val invited = w.guests.filter { e.id in it.invitedEventIds }
            val yes = invited.count { it.rsvp[e.id] == Rsvp.YES }
            val no = invited.count { it.rsvp[e.id] == Rsvp.NO }
            SectionCard(
                Modifier.clickable(enabled = ui.isCouple) { invitations = e },
                title = e.title, icon = Icons.Default.Event,
                action = if (ui.isCouple) ({ IconButton(onClick = { edit = e }) { Icon(Icons.Default.Edit, "Bearbeiten") } }) else null,
            ) {
                InfoLine(Icons.Default.Schedule, "${e.date}${if (e.time.isNotBlank()) ", ${e.time} Uhr" else ""}")
                InfoLine(Icons.Default.LocationOn, e.place)
                if (e.notes.isNotBlank()) InfoLine(Icons.Default.Notes, e.notes)
                if (ui.canOrganize) {
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Pill("${invited.size} eingeladen")
                        Pill("$yes Zusagen", MaterialTheme.colorScheme.tertiary.copy(alpha = 0.15f), Success)
                        Pill("$no Absagen", MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer)
                    }
                }
                ui.me?.let { me -> RsvpButtons(me.rsvp[e.id] ?: Rsvp.OPEN) { vm.setRsvp(me.id, e.id, it) } }
                if (ui.isCouple) Text("Tippen, um Einladungen zu verwalten", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(top = 6.dp))
            }
        }
    }

    edit?.let { e ->
        val isNew = w.events.none { it.id == e.id }
        var title by remember(e) { mutableStateOf(e.title) }
        var date by remember(e) { mutableStateOf(e.date) }
        var time by remember(e) { mutableStateOf(e.time) }
        var place by remember(e) { mutableStateOf(e.place) }
        var notes by remember(e) { mutableStateOf(e.notes) }
        var inviteAll by remember(e) { mutableStateOf(true) }
        var confirmDelete by remember(e) { mutableStateOf(false) }
        FormDialog(if (isNew) "Neuer Termin" else "Termin bearbeiten", { edit = null }, saveEnabled = title.isNotBlank() && date.isNotBlank(), onSave = {
            vm.saveEvent(e.copy(title = title, date = date, time = time, place = place, notes = notes), inviteAll)
            edit = null
        }) {
            Field(title, { title = it }, "Ereignis", required = true, placeholder = "z. B. Polterabend")
            Field(date, { date = it }, "Datum", required = true, placeholder = "TT.MM.JJJJ")
            Field(time, { time = it }, "Uhrzeit", placeholder = "HH:MM")
            Field(place, { place = it }, "Ort")
            Field(notes, { notes = it }, "Bemerkungen", singleLine = false, minLines = 3)
            if (isNew) Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(inviteAll, { inviteAll = it }); Text("Alle Gäste einladen")
            } else TextButton(onClick = { confirmDelete = true }) { Text("Termin löschen", color = MaterialTheme.colorScheme.error) }
        }
        if (confirmDelete) ConfirmDialog("Termin löschen?", "„${e.title}“ inklusive Programm und Rückmeldungen wird gelöscht.", onConfirm = { vm.deleteEvent(e.id); edit = null }, onDismiss = { confirmDelete = false })
    }

    invitations?.let { e ->
        FormDialog("Einladungen: ${e.title}", { invitations = null }, onSave = { invitations = null }) {
            Text("Wer ist zu diesem Termin eingeladen?", style = MaterialTheme.typography.bodySmall)
            w.guests.sortedBy { it.lastName }.forEach { g ->
                val invited = e.id in g.invitedEventIds
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(invited, { vm.setInvited(g.id, e.id, it) })
                    Text(g.fullName, Modifier.weight(1f), fontWeight = if (invited) FontWeight.SemiBold else FontWeight.Normal)
                    if (invited) {
                        val r = g.rsvp[e.id] ?: Rsvp.OPEN
                        Pill(
                            r.label,
                            when (r) { Rsvp.YES -> Success.copy(alpha = 0.15f); Rsvp.NO -> MaterialTheme.colorScheme.errorContainer; Rsvp.OPEN -> MaterialTheme.colorScheme.surfaceVariant },
                            when (r) { Rsvp.YES -> Success; Rsvp.NO -> MaterialTheme.colorScheme.onErrorContainer; Rsvp.OPEN -> MaterialTheme.colorScheme.onSurfaceVariant },
                        )
                    }
                }
            }
        }
    }
}
