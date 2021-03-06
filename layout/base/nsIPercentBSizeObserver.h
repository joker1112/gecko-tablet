/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsIPercentBSizeObserver_h___
#define nsIPercentBSizeObserver_h___

#include "nsQueryFrame.h"

struct nsHTMLReflowState;

/**
 * This interface is supported by frames that need to provide computed bsize
 * values to children during reflow which would otherwise not happen. Currently
 * only table cells support this.
 */
class nsIPercentBSizeObserver
{
public:
  NS_DECL_QUERYFRAME_TARGET(nsIPercentBSizeObserver)

  // Notify the observer that aReflowState has no computed bsize,
  // but it has a percent bsize
  virtual void NotifyPercentBSize(const nsHTMLReflowState& aReflowState) = 0;

  // Ask the observer if it should observe aReflowState.frame
  virtual bool NeedsToObserve(const nsHTMLReflowState& aReflowState) = 0;
};

#endif // nsIPercentBSizeObserver_h___ 
