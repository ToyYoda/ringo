package de.hochzeitsapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.hochzeitsapp.data.Person
import de.hochzeitsapp.data.Venue
import de.hochzeitsapp.data.WeddingProfile
import de.hochzeitsapp.ui.AppViewModel
import de.hochzeitsapp.ui.UiState
import de.hochzeitsapp.ui.components.Field
import de.hochzeitsapp.ui.components.SectionCard
import de.hochzeitsapp.ui.theme.Gold
import de.hochzeitsapp.ui.theme.Script

private val features = listOf(
    Icons.Default.Groups to "Gäste haben eine gemeinsame Plattform",
    Icons.Default.Info to "Alle Infos zur Hochzeit an einem Ort",
    Icons.Default.PhotoLibrary to "Fotogalerie – Gäste laden direkt hoch",
    Icons.Default.CardGiftcard to "Geschenkeliste mit anonymem Reservieren",
    Icons.Default.MarkEmailRead to "Einladungen & Zu-/Absagen",
    Icons.Default.Diversity3 to "Gruppen für Trauzeugen & Organisatoren",
    Icons.Default.Schedule to "Ablaufplan mit anmeldbaren Programmpunkten",
)

/** App-Startseite: „Die Hochzeits-App – interaktiv einladen, gemeinsam organisieren“. */
@Composable
fun WelcomeScreen(ui: UiState, vm: AppViewModel, onSetup: () -> Unit) {
    var demoDialog by remember { mutableStateOf(false) }
    var coupleLogin by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val existing = ui.wedding

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color(0xFF8E3B5A), Color(0xFFC77D92))))
                .statusBarsPadding()
                .padding(horizontal = 24.dp, vertical = 32.dp)
        ) {
            Column {
                Text("Die", color = Color.White, fontFamily = Script, fontSize = 28.sp)
                Text("Hochzeits-App", color = Color.White, style = MaterialTheme.typography.displaySmall)
                Spacer(Modifier.height(4.dp))
                Text("interaktiv einladen · gemeinsam organisieren", color = Color(0xFFF3E4CC), style = MaterialTheme.typography.bodyMedium)
            }
        }

        SectionCard(Modifier.padding(top = 12.dp)) {
            features.forEach { (icon, text) ->
                Row(Modifier.padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(icon, null, tint = Gold, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(text, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        if (existing != null) {
            SectionCard(title = "Einloggen: ${existing.profile.coupleNames}", icon = Icons.Default.Login) {
                if (coupleLogin) {
                    OutlinedTextField(
                        value = password, onValueChange = { password = it; error = null },
                        label = { Text("Passwort des Brautpaars") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true, modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { error = vm.loginCouple(password) }, modifier = Modifier.fillMaxWidth()) { Text("Als Brautpaar einloggen") }
                    TextButton(onClick = { coupleLogin = false; error = null }) { Text("Ich bin Gast") }
                } else {
                    OutlinedTextField(
                        value = code, onValueChange = { code = it; error = null },
                        label = { Text("Einladungscode") },
                        singleLine = true, modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { error = vm.loginGuest(code) }, modifier = Modifier.fillMaxWidth()) { Text("Als Gast einloggen") }
                    TextButton(onClick = { coupleLogin = true; error = null }) { Text("Wir sind das Brautpaar") }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                if (ui.isDemo) {
                    Text("Demo: Passwort „demo“, Gast-Code z. B. „ANNA01“", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        SectionCard(title = "Demo-Version", icon = Icons.Default.PlayCircle) {
            Text("Schaut euch die Beispielhochzeit von Claudia & Karl an – aus Sicht des Brautpaars oder eines Gastes.", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(8.dp))
            FilledTonalButton(onClick = { demoDialog = true }, modifier = Modifier.fillMaxWidth()) { Text("Demo starten") }
        }

        SectionCard(title = "Meine Hochzeit einrichten", icon = Icons.Default.Favorite) {
            Text("Legt eure eigene Hochzeit an und ladet eure Gäste ein.", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(8.dp))
            Button(onClick = onSetup, modifier = Modifier.fillMaxWidth()) { Text("Jetzt einrichten") }
        }
        Spacer(Modifier.height(24.dp))
    }

    if (demoDialog) {
        AlertDialog(
            onDismissRequest = { demoDialog = false },
            title = { Text("Demo ansehen als …") },
            text = { Text("Als Brautpaar könnt ihr alles verwalten. Als Gast (Anna, Trauzeugin) seht ihr die Gästeansicht.") },
            confirmButton = { TextButton(onClick = { vm.startDemo(asCouple = true); demoDialog = false }) { Text("Brautpaar") } },
            dismissButton = { TextButton(onClick = { vm.startDemo(asCouple = false, guestId = "g-anna"); demoDialog = false }) { Text("Gast") } },
        )
    }
}

/** „Meine Hochzeit einrichten“: Braut & Bräutigam, Eckdaten, Passwort. */
@Composable
fun SetupScreen(ui: UiState, vm: AppViewModel, onDone: () -> Unit, onCancel: () -> Unit) {
    var bride by remember { mutableStateOf(Person()) }
    var groom by remember { mutableStateOf(Person()) }
    var motto by remember { mutableStateOf("") }
    var date by remember { mutableStateOf("") }
    var place by remember { mutableStateOf("") }
    var pw by remember { mutableStateOf("") }
    var pw2 by remember { mutableStateOf("") }
    var tab by remember { mutableIntStateOf(0) }
    var tried by remember { mutableStateOf(false) }
    var confirmOverwrite by remember { mutableStateOf(false) }

    val valid = bride.firstName.isNotBlank() && bride.lastName.isNotBlank() && bride.mail.isNotBlank() &&
        groom.firstName.isNotBlank() && groom.lastName.isNotBlank() && groom.mail.isNotBlank() &&
        pw.length >= 4 && pw == pw2

    fun create() {
        vm.createWedding(
            WeddingProfile(
                motto = motto.ifBlank { "Wir heiraten" },
                bride = bride, groom = groom,
                headline = "Wir heiraten!",
                subline = listOf(date, place).filter { it.isNotBlank() }.joinToString(" · "),
                venues = if (date.isNotBlank() || place.isNotBlank()) listOf(Venue(title = "Trauung", place = place, date = date)) else emptyList(),
            ),
            pw,
        )
        onDone()
    }

    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onCancel) { Icon(Icons.Default.Close, "Abbrechen") }
            Text("Hochzeit einrichten", style = MaterialTheme.typography.headlineSmall)
        }
        Text("Felder mit * sind Pflichtfelder.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))

        TabRow(selectedTabIndex = tab, containerColor = Color.Transparent) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Braut") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Bräutigam") })
        }
        Spacer(Modifier.height(8.dp))
        if (tab == 0) PersonForm(bride, tried) { bride = it } else PersonForm(groom, tried) { groom = it }

        Spacer(Modifier.height(16.dp))
        Text("Eure Hochzeit", style = MaterialTheme.typography.titleMedium)
        Field(motto, { motto = it }, "Motto", placeholder = "z. B. Zwei Herzen, ein Weg")
        Field(date, { date = it }, "Datum", placeholder = "TT.MM.JJJJ")
        Field(place, { place = it }, "Ort")

        Spacer(Modifier.height(16.dp))
        Text("Passwort für die Verwaltung", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(pw, { pw = it }, label = { Text("Passwort aussuchen *") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth(), isError = tried && pw.length < 4, supportingText = { Text("mindestens 4 Zeichen") })
        OutlinedTextField(pw2, { pw2 = it }, label = { Text("Passwort wiederholen *") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth(), isError = tried && pw != pw2)

        Spacer(Modifier.height(20.dp))
        Button(
            onClick = {
                tried = true
                if (valid) { if (ui.wedding != null && !ui.isDemo) confirmOverwrite = true else create() }
                else if (bride.firstName.isBlank() || bride.lastName.isBlank() || bride.mail.isBlank()) tab = 0
                else if (groom.firstName.isBlank() || groom.lastName.isBlank() || groom.mail.isBlank()) tab = 1
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Speichern") }
        if (tried && !valid) {
            Text("Bitte alle Pflichtfelder für Braut und Bräutigam ausfüllen und das Passwort zweimal gleich eingeben.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
        }
        Spacer(Modifier.height(32.dp))
    }

    if (confirmOverwrite) {
        AlertDialog(
            onDismissRequest = { confirmOverwrite = false },
            title = { Text("Bestehende Hochzeit ersetzen?") },
            text = { Text("Auf diesem Gerät ist bereits „${ui.wedding?.profile?.coupleNames}“ eingerichtet. Alle Daten werden überschrieben.") },
            confirmButton = { TextButton(onClick = { confirmOverwrite = false; create() }) { Text("Ersetzen", fontWeight = FontWeight.Bold) } },
            dismissButton = { TextButton(onClick = { confirmOverwrite = false }) { Text("Abbrechen") } },
        )
    }
}

@Composable
fun PersonForm(p: Person, showErrors: Boolean, onChange: (Person) -> Unit) {
    @Composable
    fun req(value: String, label: String, kb: KeyboardType = KeyboardType.Text, set: (String) -> Person) =
        OutlinedTextField(
            value, { onChange(set(it)) }, label = { Text("$label *") }, singleLine = true,
            isError = showErrors && value.isBlank(),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = kb),
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        )
    req(p.firstName, "Vorname") { p.copy(firstName = it) }
    req(p.lastName, "Nachname") { p.copy(lastName = it) }
    Field(p.birthDate, { onChange(p.copy(birthDate = it)) }, "Geburtsdatum", placeholder = "TT.MM.JJJJ")
    Field(p.city, { onChange(p.copy(city = it)) }, "Wohnort")
    Field(p.street, { onChange(p.copy(street = it)) }, "Straße")
    Field(p.phone, { onChange(p.copy(phone = it)) }, "Telefon", keyboard = KeyboardType.Phone)
    req(p.mail, "E-Mail", KeyboardType.Email) { p.copy(mail = it) }
}
