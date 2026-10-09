package de.hochzeitsapp.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import de.hochzeitsapp.data.GuestRole
import de.hochzeitsapp.data.Venue
import de.hochzeitsapp.ui.AppViewModel
import de.hochzeitsapp.ui.UiState
import de.hochzeitsapp.ui.components.*
import de.hochzeitsapp.util.PdfExport

fun openMap(context: android.content.Context, place: String) {
    val uri = Uri.parse("geo:0,0?q=" + Uri.encode(place))
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
}

/** „Details zur Hochzeit“ – alle wichtigen Daten und Orte an einer Stelle, ausdruckbar. */
@Composable
fun DetailsScreen(ui: UiState, vm: AppViewModel, navigate: (String) -> Unit) {
    val w = ui.wedding ?: return
    val p = w.profile
    val context = LocalContext.current
    var editVenue by remember { mutableStateOf<Venue?>(null) }
    var editInfo by remember { mutableStateOf(false) }
    val witnesses = w.guests.filter { it.role == GuestRole.WITNESS }

    HeaderPage(
        ui, "Details zur Hochzeit", "Wann, wo und alles Wichtige auf einen Blick",
        fab = if (ui.isCouple) ({
            ExtendedFloatingActionButton(onClick = { editVenue = Venue(title = "") }, icon = { Icon(Icons.Default.Add, null) }, text = { Text("Ort") })
        }) else null,
    ) {
        items(p.venues, key = { it.id }) { v ->
            SectionCard(
                title = v.title, icon = Icons.Default.Place,
                action = if (ui.isCouple) ({ IconButton(onClick = { editVenue = v }) { Icon(Icons.Default.Edit, "Bearbeiten") } }) else null,
            ) {
                InfoLine(Icons.Default.Event, listOf(v.date, v.time.let { if (it.isNotBlank()) "$it Uhr" else "" }).filter { it.isNotBlank() }.joinToString(", "))
                if (v.place.isNotBlank()) {
                    InfoLine(Icons.Default.LocationOn, v.place)
                    TextButton(onClick = { openMap(context, v.place) }) { Icon(Icons.Default.Map, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Route anzeigen") }
                }
            }
        }
        item {
            OutlinedButton(onClick = { navigate("events") }, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                Icon(Icons.Default.CalendarMonth, null); Spacer(Modifier.width(8.dp)); Text("Alle Termine rund um die Hochzeit")
            }
        }
        item {
            SectionCard(
                title = "Gut zu wissen", icon = Icons.Default.Lightbulb,
                action = if (ui.isCouple) ({ IconButton(onClick = { editInfo = true }) { Icon(Icons.Default.Edit, "Bearbeiten") } }) else null,
            ) {
                Text(
                    p.infoText.ifBlank { if (ui.isCouple) "Hier könnt ihr Hotelempfehlungen, Parkmöglichkeiten, Ansprechpartner und Infos zu weiteren Veranstaltungen (Polterabend, Junggesellenabschied …) hinterlegen." else "Noch keine weiteren Infos." },
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        if (witnesses.isNotEmpty()) {
            item {
                SectionCard(title = "Unsere Trauzeugen", icon = Icons.Default.Star) {
                    witnesses.forEach { g ->
                        Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(g.fullName, g.photo, 36.dp)
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(g.fullName, fontWeight = FontWeight.SemiBold)
                                Text("für ${g.side.label}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
        item {
            TextButton(
                onClick = {
                    val lines = buildList {
                        add("# Motto"); add(p.motto)
                        p.venues.forEach { add("# ${it.title}"); add("${it.date} ${it.time}".trim()); add(it.place) }
                        if (ui.visibleEvents().isNotEmpty()) {
                            add("# Termine")
                            ui.visibleEvents().forEach { add("${it.date} ${it.time} – ${it.title}, ${it.place}") }
                        }
                        if (p.infoText.isNotBlank()) { add("# Gut zu wissen"); addAll(p.infoText.split("\n")) }
                        if (witnesses.isNotEmpty()) { add("# Trauzeugen"); witnesses.forEach { add("${it.fullName} (${it.side.label})") } }
                    }
                    PdfExport.share(context, "Hochzeit-Infos.pdf", "Hochzeit ${p.coupleNames}", lines)
                },
                modifier = Modifier.padding(horizontal = 16.dp),
            ) { Icon(Icons.Default.PictureAsPdf, null); Spacer(Modifier.width(6.dp)); Text("Als PDF teilen / drucken") }
        }
    }

    editVenue?.let { v ->
        var title by remember(v) { mutableStateOf(v.title) }
        var place by remember(v) { mutableStateOf(v.place) }
        var date by remember(v) { mutableStateOf(v.date) }
        var time by remember(v) { mutableStateOf(v.time) }
        val isNew = p.venues.none { it.id == v.id }
        FormDialog(if (isNew) "Ort hinzufügen" else "Ort bearbeiten", { editVenue = null }, saveEnabled = title.isNotBlank(), onSave = {
            val nv = v.copy(title = title, place = place, date = date, time = time)
            vm.updateProfile { pr -> pr.copy(venues = if (isNew) pr.venues + nv else pr.venues.map { if (it.id == v.id) nv else it }) }
            editVenue = null
        }) {
            Field(title, { title = it }, "Bezeichnung", required = true, placeholder = "z. B. Standesamtlich, Kirchlich, Feier")
            Field(place, { place = it }, "Wo", placeholder = "Name und Adresse")
            Field(date, { date = it }, "Datum", placeholder = "TT.MM.JJJJ")
            Field(time, { time = it }, "Uhrzeit", placeholder = "HH:MM")
            if (!isNew) {
                TextButton(onClick = { vm.updateProfile { pr -> pr.copy(venues = pr.venues.filterNot { it.id == v.id }) }; editVenue = null }) {
                    Text("Ort löschen", color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }

    if (editInfo) {
        var text by remember { mutableStateOf(p.infoText) }
        FormDialog("Gut zu wissen", { editInfo = false }, onSave = { vm.updateProfile { it.copy(infoText = text) }; editInfo = false }) {
            Text("Hotelempfehlungen, örtliche Besonderheiten (Parkplatz), Ansprechpartner, Infos zu weiteren Veranstaltungen …", style = MaterialTheme.typography.bodySmall)
            Field(text, { text = it }, "Text", singleLine = false, minLines = 10)
        }
    }
}

@Composable
fun InfoLine(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    if (text.isBlank()) return
    Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}
