<?php
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Reporter (r.m.o).
 *
 * The Initial Developer of the Original Code is
 *      Robert Accettura <robert@accettura.com>.
 *
 * Portions created by the Initial Developer are Copyright (C) 2004
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

class userlib {

function login($username, $password){
	global $db;

	$data =& $db->getRow("SELECT user.user_id, user.user_username, user.user_password, user.user_realname, user.user_status
                          FROM user
                          WHERE  user.user_username = '".$username."' AND user.user_password = md5('".$password."')", DB_FETCHMODE_ASSOC);
	if ($data['user_status'] == 1){
		$_SESSION['user_id'] = $data['user_id'];
		$_SESSION['user_realname'] = $data['user_realname'];
		$_SESSION['user_username'] = $data['user_username'];
		$_SESSION['login'] = true;
		return array(true, '');
	} else {
		return array(false, 'Bad Status');
	}

	return true;
}

function isLoggedIn(){
	if ($_SESSION['user_username'] && $_SESSION['login'] == true){
		return true;
	}
	else {
		return false;
	}
}

// End Class
}
$userlib = new userlib;
?>
