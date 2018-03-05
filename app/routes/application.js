import { inject as service } from '@ember/service';
import { debug } from '@ember/debug';

import Route from '@ember/routing/route';

export default Route.extend({
  actions: {
    signin () {
      this.get('session').open('arcgis-oauth-bearer')
        .then((authorization) => {
          debug('AUTH SUCCESS: ', authorization);
          //transition to some secured route or... so whatever is needed
          this.transitionTo('index');
        })
        .catch((err)=>{
          debug('AUTH ERROR: ', err);
        });
    },
    signout () {
      debug(' do sign out');
    }
  },
  intl: service(),
  beforeModel() {
    return this.get('intl').setLocale('en-us');
  }
});