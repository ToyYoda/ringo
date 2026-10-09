package de.hochzeitsapp.ui.screens

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import de.hochzeitsapp.data.*
import de.hochzeitsapp.ui.AppViewModel
import de.hochzeitsapp.ui.UiState
import de.hochzeitsapp.ui.components.*
import de.hochzeitsapp.ui.theme.Success
import de.hochzeitsapp.util.PdfExport

/** Gästeliste: Kurzvorstellung aller Gäste mit Standardstruktur. */
@Composable
fun GuestsScreen(ui: UiState, vm: AppViewModel, navigate: (String) -> Unit) {
    val w = ui.wedding ?: return
    val context = LocalContext.current
    var query by rememberSaveable { mutableStateOf("") }
    var side by rememberSaveable { mutableStateOf<Side?>(null) }
    var edit by remember { mutableStateOf<Guest?>(null) }
    val me = ui.me

    val list = w.guests
        .filter { side == null || it.side == side || it.side == Side.BOTH }
        .filter { query.isBlank() || it.fullName.contains(query, ignoreCase = true) || it.city.contains(query, ignoreCase = true) }
        .sortedWith(compareBy({ it.id != me?.id }, { it.lastName }, { it.firstName }))

    HeaderPage(
        ui, "Gästeliste", "Wer kommt? Lernt euch schon vorher kennen!",
        fab = if (ui.isCouple) ({
            ExtendedFloatingActionButton(onClick = { edit = Guest(firstName = "", invitedEventIds = w.events.map { it.id }) }, icon = { Icon(Icons.Default.PersonAdd, null) }, text = { Text("Gast") })
        }) else null,
    ) {
        if (me != null && me.howWeMet.isBlank() && me.wish.isBlank()) {
            item {
                SectionCard(title = "Stell dich vor!", icon = Icons.Default.WavingHand) {
                    Text("Ergänze deinen Eintrag mit Foto, woher du das Brautpaar kennst und einem Wunsch.", style = MaterialTheme.typography.bodyMedium)
                    TextButton(onClick = { edit = me }) { Text("Eintrag bearbeiten") }
                }
            }
        }
        item {
            OutlinedTextField(
                query, { query = it }, placeholder = { Text("Suchen …") }, leadingIcon = { Icon(Icons.Default.Search, null) },
                singleLine = true, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            )
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(side == null, { side = null }, label = { Text("Alle (${w.guests.size})") })
                FilterChip(side == Side.BRIDE, { side = Side.BRIDE }, label = { Text("Seite der Braut") })
                FilterChip(side == Side.GROOM, { side = Side.GROOM }, label = { Text("Seite des Bräutigams") })
            }
        }
        if (list.isEmpty()) item { EmptyState(Icons.Default.Groups, if (ui.isCouple) "Fügt eure ersten Gäste hinzu." else "Keine Gäste gefunden.") }
        items(list, key = { it.id }) { g ->
            ListItem(
                modifier = Modifier.clickable { navigate("guest/${g.id}") },
                leadingContent = { Avatar(g.fullName, g.photo) },
                headlineContent = { Text(g.fullName + if (g.id == me?.id) " (du)" else "", fontWeight = FontWeight.SemiBold) },
                supportingContent = {
                    Text(listOf(g.relation.label + " · " + g.side.label, g.city).filter { it.isNotBlank() }.joinToString(" · "), maxLines = 1)
                },
                trailingContent = {
                    if (g.role != GuestRole.GUEST) Pill(g.role.label)
                    else if (ui.isCouple) {
                        val open = g.invitedEventIds.count { (g.rsvp[it] ?: Rsvp.OPEN) == Rsvp.OPEN }
                        if (open > 0) Pill("$open offen", MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.background),
            )
        }
        if (ui.canOrganize) {
            item {
                TextButton(
                    onClick = {
                        val lines = buildList {
                            Side.entries.forEach { s ->
                                val gs = w.guests.filter { it.side == s }.sortedBy { it.lastName }
                                if (gs.isNotEmpty()) {
                                    add("# Gäste: ${s.label} (${gs.size})")
                                    gs.forEach { g ->
                                        val answers = w.events.filter { it.id in g.invitedEventIds }.joinToString(", ") { e -> "${e.title}: ${(g.rsvp[e.id] ?: Rsvp.OPEN).label}" }
                                        add("${g.fullName}${if (g.city.isNotBlank()) " (${g.city})" else ""} – ${g.relation.label}${if (g.role != GuestRole.GUEST) ", ${g.role.label}" else ""}${if (g.needsAccommodation) ", braucht Übernachtung" else ""}")
                                        if (answers.isNotBlank()) add("    $answers")
                                    }
                                }
                            }
                        }
                        PdfExport.share(context, "Gaesteliste.pdf", "Gästeliste ${w.profile.coupleNames}", lines)
                    },
                    modifier = Modifier.padding(horizontal = 16.dp),
                ) { Icon(Icons.Default.PictureAsPdf, null); Spacer(Modifier.width(6.dp)); Text("Gästeliste als PDF") }
            }
        }
    }

    edit?.let { g -> GuestEditor(ui, vm, g) { edit = null } }
}

@Composable
fun GuestDetailScreen(ui: UiState, vm: AppViewModel, guestId: String, onBack: () -> Unit) {
    val w = ui.wedding ?: return
    val g = w.guests.find { it.id == guestId }
    if (g == null) { NotFound(onBack); return }
    val context = LocalContext.current
    var edit by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val isMe = g.id == ui.me?.id

    HeaderPage(ui, g.fullName, g.relation.label + " · " + g.side.label, onBack = onBack) {
        item {
            Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Avatar(g.fullName, g.photo, 96.dp)
                if (g.role != GuestRole.GUEST) { Spacer(Modifier.height(6.dp)); Pill(g.role.label) }
                if (isMe || ui.isCouple) TextButton(onClick = { edit = true }) { Icon(Icons.Default.Edit, null); Spacer(Modifier.width(6.dp)); Text(if (isMe) "Meinen Eintrag bearbeiten" else "Bearbeiten") }
            }
        }
        item {
            SectionCard(title = "Steckbrief", icon = Icons.Default.Badge) {
                InfoLine(Icons.Default.Home, g.city)
                InfoLine(Icons.Default.Favorite, if (g.partner.isNotBlank()) "Partner/in: ${g.partner}" else "")
                InfoLine(Icons.Default.Handshake, if (g.howWeMet.isNotBlank()) "Woher: ${g.howWeMet}" else "")
                if (g.wish.isNotBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Text("Wunsch an das Brautpaar", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.secondary)
                    Text("„${g.wish}“", style = MaterialTheme.typography.bodyLarge)
                }
                if (g.city.isBlank() && g.partner.isBlank() && g.howWeMet.isBlank() && g.wish.isBlank()) {
                    Text("Noch keine Vorstellung.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (ui.isCouple || isMe) {
            item {
                SectionCard(title = "Einladungen", icon = Icons.Default.MarkEmailRead) {
                    val evs = w.events.filter { it.id in g.invitedEventIds }.sortedBy { dateKey(it.date, it.time) }
                    if (evs.isEmpty()) Text("Zu keinem Termin eingeladen.")
                    evs.forEach { e ->
                        val r = g.rsvp[e.id] ?: Rsvp.OPEN
                        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(e.title, fontWeight = FontWeight.SemiBold)
                                Text(e.date, style = MaterialTheme.typography.bodySmall)
                            }
                            Pill(r.label, if (r == Rsvp.YES) Success.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceVariant, if (r == Rsvp.YES) Success else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (isMe) RsvpButtons(r) { vm.setRsvp(g.id, e.id, it) }
                    }
                    if (g.needsAccommodation) InfoLine(Icons.Default.Hotel, "Benötigt Übernachtung")
                }
            }
        }
        if (ui.isCouple) {
            item {
                SectionCard(title = "Einladung verschicken", icon = Icons.Default.Send) {
                    Text("Einladungscode: ${g.inviteCode}", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    Text("Mit diesem Code meldet sich ${g.firstName} in der App an.", style = MaterialTheme.typography.bodySmall)
                    Row {
                        TextButton(onClick = { shareInvitation(context, w, g) }) { Text("Einladung teilen") }
                        TextButton(onClick = { confirmDelete = true }) { Text("Gast entfernen", color = MaterialTheme.colorScheme.error) }
                    }
                }
            }
        }
    }

    if (edit) GuestEditor(ui, vm, g) { edit = false }
    if (confirmDelete) ConfirmDialog("Gast entfernen?", "${g.fullName} wird aus der Gästeliste gelöscht.", onConfirm = { vm.deleteGuest(g.id); onBack() }, onDismiss = { confirmDelete = false })
}

fun shareInvitation(context: android.content.Context, w: Wedding, g: Guest) {
    val events = w.events.filter { it.id in g.invitedEventIds }.joinToString("\n") { "• ${it.title}: ${it.date} ${it.time} – ${it.place}" }
    val text = """
        Liebe/r ${g.firstName},

        wir heiraten und möchten dich herzlich einladen!

        $events

        In unserer Hochzeits-App findest du alle Infos, kannst zu- oder absagen, Fotos teilen und einen Programmpunkt anmelden.
        Dein persönlicher Einladungscode: ${g.inviteCode}

        Wir freuen uns auf dich!
        ${w.profile.coupleNames}
    """.trimIndent()
    val i = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, "Einladung zur Hochzeit von ${w.profile.coupleNames}")
        putExtra(Intent.EXTRA_TEXT, text)
        if (g.mail.isNotBlank()) putExtra(Intent.EXTRA_EMAIL, arrayOf(g.mail))
    }
    context.startActivity(Intent.createChooser(i, "Einladung senden"))
}

@Composable
private fun GuestEditor(ui: UiState, vm: AppViewModel, g: Guest, onDismiss: () -> Unit) {
    val w = ui.wedding!!
    val isNew = w.guests.none { it.id == g.id }
    var guest by remember(g) { mutableStateOf(g) }
    val picker = rememberPhotoPicker { guest = guest.copy(photo = it) }

    FormDialog(if (isNew) "Gast hinzufügen" else "Eintrag bearbeiten", onDismiss, saveEnabled = guest.firstName.isNotBlank(), onSave = {
        vm.saveGuest(guest); onDismiss()
    }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(guest.fullName.ifBlank { "?" }, guest.photo, 64.dp)
            Spacer(Modifier.width(12.dp))
            PhotoSourceButtons(picker)
        }
        Field(guest.firstName, { guest = guest.copy(firstName = it) }, "Vorname", required = true)
        Field(guest.lastName, { guest = guest.copy(lastName = it) }, "Nachname")
        Field(guest.city, { guest = guest.copy(city = it) }, "Wohnort")
        if (ui.isCouple) Field(guest.mail, { guest = guest.copy(mail = it) }, "E-Mail", keyboard = KeyboardType.Email)
        Picker("Kennt …", Side.entries, guest.side, { it.label }, { guest = guest.copy(side = it) })
        Picker("Beziehung", Relation.entries, guest.relation, { it.label }, { guest = guest.copy(relation = it) })
        Field(guest.partner, { guest = guest.copy(partner = it) }, "Partner/in", placeholder = "Name oder „Single“")
        Field(guest.howWeMet, { guest = guest.copy(howWeMet = it) }, "Woher kennt ihr euch?")
        Field(guest.wish, { guest = guest.copy(wish = it) }, "Wunsch an das Brautpaar", singleLine = false, minLines = 2)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(guest.needsAccommodation, { guest = guest.copy(needsAccommodation = it) }); Text("Benötigt Übernachtung")
        }
        if (ui.isCouple) {
            Picker("Rolle", GuestRole.entries, guest.role, { it.label }, { guest = guest.copy(role = it) })
            Text("Trauzeugen und Organisatoren können Programm und Termine mitplanen und sehen Überraschungen.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            Text("Eingeladen zu", style = MaterialTheme.typography.titleSmall)
            w.events.forEach { e ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(e.id in guest.invitedEventIds, { on ->
                        guest = guest.copy(invitedEventIds = if (on) guest.invitedEventIds + e.id else guest.invitedEventIds - e.id)
                    })
                    Text("${e.title} (${e.date})")
                }
            }
        }
    }
}
